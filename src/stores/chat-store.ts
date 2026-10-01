import { create } from 'zustand';
import { presenceBoundary, receivePresenceSnapshot, resetPresence } from '@/lib/chat-presence';
import * as api from '@/api/chat';
import { isApiError } from '@/api/client';
import type { ImageFile, ImageInput } from '@/api/images';
import { applyReceipt, mergeMessages, mergeReceipts, newerMessage } from '@/lib/chat-helpers';
import { errorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';

// An unsent message. `photo` is the local file, shown until the server's copy arrives. `uploaded`
// is set once Cloudinary has the file, so a retry sends that same upload instead of a new copy.
export type PendingMessage = {
  clientMessageId: string; text: string; createdAt: string; status: 'sending' | 'failed'; error?: string;
  photo?: ImageFile; uploaded?: ImageInput;
};
type Thread = { messages: api.Message[]; cursor: number; hasOlder: boolean; pending: PendingMessage[] };
type State = {
  conversations: Record<string, api.Conversation>; lists: Record<string, string[]>;
  threads: Record<string, Thread>; errors: Record<string, string>; drafts: Record<string, string>;
  // A photo waiting in the composer, per chat, kept like the text draft while the user looks elsewhere.
  draftPhotos: Record<string, ImageFile>;
  activeId: string | null; connected: boolean;
  loadList: (householdId: string) => Promise<void>;
  sync: (id: string) => Promise<void>; older: (id: string) => Promise<void>;
  // With a photo, `text` is its caption and may be empty. A retry finds its photo on the unsent row.
  send: (id: string, text: string, retryId?: string, photo?: ImageFile) => Promise<void>;
  // Changes the text of one of the user's own messages, or its photo's caption.
  edit: (id: string, messageId: string, text: string) => Promise<void>;
  deleteMessages: (id: string, messageIds: string[], scope: 'me' | 'everyone') => Promise<void>;
  clear: (id: string) => Promise<void>;
  read: (id: string, sequence: number) => Promise<void>;
  mute: (id: string, muted: boolean) => Promise<void>;
  direct: (householdId: string, recipientId: string) => Promise<string>;
  receive: (message: api.Message, summary?: { unreadCount: number; lastReadSequence: number; muted: boolean }) => void;
  receiveDeletion: (deletion: api.MessageDeletion) => void;
  // Someone, maybe this user on another device, edited a message.
  receiveEdit: (message: api.Message) => void;
  receiveClear: (clear: api.ChatClear) => void;
  receiveRead: (conversationId: string, lastReadSequence: number, unreadCount: number) => void;
  // Someone else's delivered or read progress moved, which re-ticks this user's own messages.
  receiveReceipt: (event: api.ReceiptEvent) => void;
  // Tells the backend that messages up to `sequence` have reached this phone.
  delivered: (id: string, sequence: number) => void;
  receivePreferences: (conversationId: string, muted: boolean) => void;
  draft: (id: string, text: string) => void;
  // Puts a photo in the composer, or takes it out with null.
  attach: (id: string, photo: ImageFile | null) => void;
};
const empty = (): Thread => ({ messages: [], cursor: 0, hasOlder: false, pending: [] });
const data = () => ({ conversations: {}, lists: {}, threads: {}, errors: {}, drafts: {}, draftPhotos: {}, activeId: null, connected: false });
function without<T>(record: Record<string, T>, id: string): Record<string, T> {
  const next = { ...record }; delete next[id]; return next;
}
// Locks include the session token, so one account's request never blocks another's.
const syncing = new Map<string, Promise<void>>();
const listing = new Map<string, Promise<void>>();
const reading = new Set<string>();
// The highest position already reported as delivered, per session and chat, so each new message
// costs one request at most and a repeated event costs none.
const reported = new Map<string, number>();
const preferenceVersion = new Map<string, number>();
function reconcile(existing: api.Conversation | undefined, incoming: api.Conversation): api.Conversation {
  // The same goes for other people's ticks: a GET that started before a receipt arrived is older.
  const next = { ...incoming, receipts: mergeReceipts(existing?.receipts, incoming.receipts) };
  if (!existing || incoming.lastReadSequence >= existing.lastReadSequence) return next;
  // A GET started before our read request must not restore old unread badges.
  return { ...next, lastReadSequence: existing.lastReadSequence, unreadCount: existing.unreadCount };
}
const token = () => { const t = useAuthStore.getState().session?.token; if (!t) throw new Error('Please sign in again.'); return t; };
const current = (t: string) => useAuthStore.getState().session?.token === t;

export const useChatStore = create<State>((set, get) => {
  function accept(message: api.Message, summary?: { unreadCount: number; lastReadSequence: number; muted: boolean }) {
    if (message.senderId !== useAuthStore.getState().session?.user.id) get().delivered(message.conversationId, message.sequence);
    set(state => {
      const thread = state.threads[message.conversationId];
      const conversation = state.conversations[message.conversationId];
      const messages = thread ? mergeMessages(thread.messages, [message]) : undefined;
      let cursor = thread?.cursor ?? 0;
      // Socket delivery may arrive out of order. Move the recovery cursor only across a contiguous
      // run; a later reconnect will fetch from the first missing sequence.
      if (messages) {
        const sequences = new Set(messages.map(item => item.sequence));
        while (sequences.has(cursor + 1)) cursor++;
      }
      return {
        ...(thread && messages ? { threads: { ...state.threads, [message.conversationId]: { ...thread,
          messages, cursor,
          pending: thread.pending.filter(p => !(p.clientMessageId === message.clientMessageId && message.senderId === useAuthStore.getState().session?.user.id)),
        } } } : {}),
        ...(conversation ? { conversations: { ...state.conversations, [message.conversationId]: {
          ...conversation,
          latestMessage: !conversation.latestMessage || message.sequence >= conversation.latestMessage.sequence ? message : conversation.latestMessage,
          updatedAt: message.createdAt,
          ...(summary ? {
            unreadCount: summary.unreadCount,
            lastReadSequence: Math.max(conversation.lastReadSequence, summary.lastReadSequence),
            muted: summary.muted,
          } : {}),
        } } } : {}),
      };
    });
  }
  function applyDeletion(deletion: api.MessageDeletion) {
    set(state => {
      const thread = state.threads[deletion.conversationId];
      let threads = state.threads;
      if (thread) {
        // The whole batch lands in one update: "me" drops the rows, "everyone" swaps in tombstones.
        const ids = new Set(deletion.messageIds);
        const tombstones = new Map(deletion.messages.map(message => [message.id, message]));
        const messages = deletion.scope === 'me'
          ? thread.messages.filter(message => !ids.has(message.id))
          : thread.messages.map(message => tombstones.get(message.id) ?? message);
        threads = { ...state.threads, [deletion.conversationId]: { ...thread, messages } };
      }
      return {
        threads,
        conversations: { ...state.conversations, [deletion.conversationId]: deletion.conversation },
      };
    });
  }
  function applyClear(clear: api.ChatClear) {
    set(state => {
      const thread = state.threads[clear.conversationId];
      return {
        // A message newer than the marker arrived while the request was in flight, so it stays.
        // Unsent messages stay too. Nothing older is left on the server for this user to load.
        ...(thread ? { threads: { ...state.threads, [clear.conversationId]: { ...thread,
          messages: thread.messages.filter(message => message.sequence > clear.clearedSequence),
          cursor: Math.max(thread.cursor, clear.clearedSequence), hasOlder: false,
        } } } : {}),
        conversations: { ...state.conversations, [clear.conversationId]: clear.conversation },
      };
    });
  }
  function applyReconciliation(id: string, reconciliation: api.MessageReconciliation) {
    set(state => {
      const thread = state.threads[id];
      if (!thread) return state;
      const hidden = new Set(reconciliation.hiddenMessageIds);
      const changed = new Map([...(reconciliation.editedMessages ?? []), ...reconciliation.deletedMessages].map(message => [message.id, message]));
      const messages = thread.messages
        .filter(message => !hidden.has(message.id))
        .map(message => { const copy = changed.get(message.id); return copy ? newerMessage(message, copy) : message; });
      return { threads: { ...state.threads, [id]: { ...thread, messages } } };
    });
  }
  // Replaces only a message this phone already holds. An edit to one outside the loaded history is
  // picked up when that history loads, with the new text already in it.
  function applyEdit(message: api.Message) {
    set(state => {
      const thread = state.threads[message.conversationId];
      const conversation = state.conversations[message.conversationId];
      const latest = conversation?.latestMessage;
      return {
        ...(thread?.messages.some(item => item.id === message.id) ? { threads: { ...state.threads, [message.conversationId]: {
          ...thread, messages: mergeMessages(thread.messages, [message]),
        } } } : {}),
        ...(conversation && latest?.id === message.id ? { conversations: { ...state.conversations, [message.conversationId]: {
          ...conversation, latestMessage: newerMessage(latest, message),
        } } } : {}),
      };
    });
  }
  function fail(id: string, error: unknown, t: string) {
    if (!current(t)) return;
    if (isApiError(error) && error.status === 404) {
      set(state => {
        const conversations = { ...state.conversations }; delete conversations[id];
        const threads = { ...state.threads }; delete threads[id];
        const drafts = { ...state.drafts }; delete drafts[id];
        return { conversations, threads, drafts, draftPhotos: without(state.draftPhotos, id), errors: { ...state.errors, [id]: 'This chat is no longer available. You may no longer belong to this household.' } };
      });
    } else set(state => ({ errors: { ...state.errors, [id]: errorMessage(error, 'Could not update this chat. Please try again.') } }));
    if (isApiError(error) && error.status === 401) void useAuthStore.getState().logout().catch(() => useAuthStore.setState({ session: null }));
  }
  return {
    ...data(),
    draft: (id, text) => set(state => ({ drafts: { ...state.drafts, [id]: text } })),
    attach: (id, photo) => set(state => ({ draftPhotos: photo ? { ...state.draftPhotos, [id]: photo } : without(state.draftPhotos, id) })),
    receive: accept,
    receiveDeletion: applyDeletion,
    receiveEdit: applyEdit,
    receiveClear: applyClear,
    receiveRead: (id, lastReadSequence, unreadCount) => set(state => {
      const conversation = state.conversations[id];
      if (!conversation || lastReadSequence < conversation.lastReadSequence) return state;
      return { conversations: { ...state.conversations, [id]: { ...conversation, lastReadSequence, unreadCount } } };
    }),
    receiveReceipt: (event) => set(state => {
      const conversation = state.conversations[event.conversationId];
      const receipts = applyReceipt(conversation?.receipts, event);
      return conversation && receipts !== conversation.receipts
        ? { conversations: { ...state.conversations, [event.conversationId]: { ...conversation, receipts } } } : state;
    }),
    // Best effort and never awaited: a failed report is simply made again by the next sync. What
    // this user has read already counts as delivered on the backend, so that is not reported.
    delivered: (id, sequence) => {
      const t = useAuthStore.getState().session?.token;
      if (!t) return;
      const key = `${t}:${id}`;
      if (sequence <= Math.max(reported.get(key) ?? 0, get().conversations[id]?.lastReadSequence ?? 0)) return;
      reported.set(key, sequence);
      api.markDelivered(t, id, sequence).catch(() => { if (reported.get(key) === sequence) reported.delete(key); });
    },
    receivePreferences: (id, muted) => set(state => {
      const conversation = state.conversations[id];
      return conversation ? { conversations: { ...state.conversations, [id]: { ...conversation, muted } } } : state;
    }),
    loadList: (householdId) => {
      const t = token(), key = `${t}:${householdId}`;
      const running = listing.get(key); if (running) return running;
      const job = (async () => {
        const versions = new Map(preferenceVersion);
        const presenceStart = presenceBoundary();
        const conversations = await api.listConversations(t, householdId);
        if (!current(t)) return;
        receivePresenceSnapshot(conversations.flatMap(c => c.participants), presenceStart);
        set(state => ({ conversations: { ...state.conversations, ...Object.fromEntries(conversations.map(c => {
          const previous = state.conversations[c.id];
          const next = reconcile(previous, c);
          return [c.id, previous && versions.get(c.id) !== preferenceVersion.get(c.id) ? { ...next, muted: previous.muted } : next];
        })) }, lists: { ...state.lists, [householdId]: conversations.map(c => c.id) } }));
        // The list shows each chat's latest message, so that message has reached this phone.
        const me = useAuthStore.getState().session?.user.id;
        for (const c of conversations) if (c.latestMessage && c.latestMessage.senderId !== me) get().delivered(c.id, c.latestMessage.sequence);
      })().catch(error => {
        if (current(t) && isApiError(error) && error.status === 404) {
          for (const c of Object.values(get().conversations)) {
            if (c.householdId === householdId) fail(c.id, error, t);
          }
          set(state => ({ lists: { ...state.lists, [householdId]: [] } }));
        }
        if (current(t) && isApiError(error) && error.status === 401) {
          void useAuthStore.getState().logout().catch(() => useAuthStore.setState({ session: null }));
        }
        throw error;
      }).finally(() => listing.delete(key));
      listing.set(key, job); return job;
    },
    sync: (id) => {
      const t = token(), key = `${t}:${id}`;
      const running = syncing.get(key); if (running) return running;
      const job = (async () => {
        try {
          const version = preferenceVersion.get(id);
          const presenceStart = presenceBoundary();
          const conversation = await api.getConversation(t, id);
          if (!current(t)) return;
          receivePresenceSnapshot(conversation.participants, presenceStart);
          const previous = get().threads[id];
          if (previous?.messages.length) {
            for (let index = 0; index < previous.messages.length && current(t); index += 100) {
              const reconciliation = await api.reconcileMessages(t, id, previous.messages.slice(index, index + 100).map(message => message.id));
              if (!current(t)) return;
              applyReconciliation(id, reconciliation);
            }
          }
          let cursor = previous?.cursor;
          let more = true;
          while (more && current(t)) {
            const page = await api.getMessages(t, id, cursor === undefined ? undefined : { after: cursor });
            if (!current(t)) return;
            // Only REST pages move this recovery cursor. An out-of-order socket message must not skip a gap.
            const initial = cursor === undefined;
            cursor = initial || !page.hasMore ? page.latestSequence : (page.nextAfter ?? cursor);
            more = !initial && page.hasMore;
            set(state => {
              const thread = state.threads[id] ?? empty();
              const messages = mergeMessages(thread.messages, page.messages);
              return { threads: { ...state.threads, [id]: { ...thread, messages, cursor: cursor!, hasOlder: initial ? page.hasMore : thread.hasOlder,
                pending: thread.pending.filter(p => !messages.some(m => m.senderId === useAuthStore.getState().session?.user.id && m.clientMessageId === p.clientMessageId)),
              } } };
            });
            if (more && page.messages.length === 0) throw new Error('Could not finish updating this chat. Please try again.');
          }
          // Everything up to the recovery cursor is now on this phone.
          if (current(t) && cursor) get().delivered(id, cursor);
          if (current(t)) set(state => ({ conversations: { ...state.conversations, [id]: { ...reconcile(state.conversations[id], conversation), muted: state.conversations[id] && version !== preferenceVersion.get(id) ? state.conversations[id].muted : conversation.muted } }, errors: { ...state.errors, [id]: '' } }));
        } catch (error) { fail(id, error, t); throw error; }
      })().finally(() => syncing.delete(key));
      syncing.set(key, job); return job;
    },
    older: async (id) => {
      const t = token(), thread = get().threads[id];
      if (!thread?.hasOlder || !thread.messages.length) return;
      try {
        const page = await api.getMessages(t, id, { before: thread.messages[0].sequence });
        if (current(t)) set(state => {
          const latest = state.threads[id]; if (!latest) return state;
          return { threads: { ...state.threads, [id]: { ...latest, messages: mergeMessages(latest.messages, page.messages), hasOlder: page.hasMore } } };
        });
      } catch (error) { fail(id, error, t); throw error; }
    },
    send: async (id, text, retryId, photo) => {
      const t = token();
      const clientMessageId = retryId ?? `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
      const pending = get().threads[id]?.pending.find(p => p.clientMessageId === clientMessageId);
      const file = photo ?? pending?.photo;
      if ((!text.trim() && !file) || text.length > 4000 || !get().conversations[id]?.canSend) return;
      if (pending?.status === 'sending') return;
      const change = (update: (p: PendingMessage) => PendingMessage) => set(state => {
        const thread = state.threads[id]; if (!thread) return state;
        return { threads: { ...state.threads, [id]: { ...thread, pending: thread.pending.map(p => p.clientMessageId === clientMessageId ? update(p) : p) } } };
      });
      set(state => {
        const thread = state.threads[id] ?? empty();
        const row: PendingMessage = { clientMessageId, text, createdAt: pending?.createdAt ?? new Date().toISOString(), status: 'sending',
          ...(file ? { photo: file } : {}), ...(pending?.uploaded ? { uploaded: pending.uploaded } : {}) };
        return {
          drafts: retryId ? state.drafts : { ...state.drafts, [id]: '' },
          draftPhotos: retryId ? state.draftPhotos : without(state.draftPhotos, id),
          threads: { ...state.threads, [id]: { ...thread, pending: [...thread.pending.filter(p => p.clientMessageId !== clientMessageId), row] } },
        };
      });
      try {
        let uploaded = pending?.uploaded;
        if (file && !uploaded) {
          uploaded = await api.uploadChatPhoto(t, id, file);
          if (!current(t)) return;
          const done = uploaded;
          change(p => ({ ...p, uploaded: done }));
        }
        const message = await api.sendMessage(t, id, clientMessageId, text, uploaded ? [uploaded] : []);
        if (current(t)) accept(message);
      }
      catch (error) {
        if (current(t)) change(p => ({ ...p, status: 'failed', error: errorMessage(error, 'Could not send. Tap to retry.') }));
        if (isApiError(error) && (error.status === 404 || error.status === 401)) fail(id, error, t);
        if (isApiError(error) && error.status === 403) void get().sync(id).catch(() => {});
      }
    },
    edit: async (id, messageId, text) => {
      const t = token();
      const message = await api.editMessage(t, id, messageId, text);
      if (current(t)) applyEdit(message);
    },
    deleteMessages: async (id, messageIds, scope) => {
      const t = token();
      const deletion = await api.deleteMessages(t, id, messageIds, scope);
      if (current(t)) applyDeletion(deletion);
    },
    // Clearing also reads the chat, so the bell's count may have dropped.
    clear: async (id) => {
      const t = token();
      const result = await api.clearConversation(t, id);
      if (!current(t)) return;
      applyClear(result);
      void useNotificationStore.getState().refreshUnreadCount().catch(() => {});
    },
    read: async (id, sequence) => {
      const t = token(), key = `${t}:${id}`;
      if (reading.has(key) || sequence <= (get().conversations[id]?.lastReadSequence ?? 0)) return;
      reading.add(key);
      try {
        const result = await api.markRead(t, id, sequence);
        if (!current(t)) return;
        set(state => {
          const c = state.conversations[id];
          return c && result.lastReadSequence >= c.lastReadSequence ? { conversations: { ...state.conversations, [id]: { ...c, ...result } } } : state;
        });
        void useNotificationStore.getState().refreshUnreadCount().catch(() => {});
      } finally { reading.delete(key); }
    },
    mute: async (id, muted) => {
      const t = token(); await api.setMuted(t, id, muted);
      if (current(t)) preferenceVersion.set(id, (preferenceVersion.get(id) ?? 0) + 1);
      if (current(t)) set(state => { const c = state.conversations[id]; return c ? { conversations: { ...state.conversations, [id]: { ...c, muted } } } : state; });
    },
    direct: async (householdId, recipientId) => {
      const t = token(), presenceStart = presenceBoundary();
      const c = await api.startDirect(t, householdId, recipientId);
      if (!current(t)) throw new Error('Your session changed. Please try again.');
      receivePresenceSnapshot(c.participants, presenceStart);
      set(state => ({ conversations: { ...state.conversations, [c.id]: c } }));
      return c.id;
    },
  };
});
useAuthStore.subscribe((state, previous) => {
  if (state.session?.token !== previous.session?.token) { preferenceVersion.clear(); reported.clear(); resetPresence(); useChatStore.setState(data()); }
});
