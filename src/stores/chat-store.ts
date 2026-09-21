import { create } from 'zustand';
import * as api from '@/api/chat';
import { isApiError } from '@/api/client';
import { mergeMessages } from '@/lib/chat-helpers';
import { errorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';

export type PendingMessage = { clientMessageId: string; text: string; createdAt: string; status: 'sending' | 'failed'; error?: string };
type Thread = { messages: api.Message[]; cursor: number; hasOlder: boolean; pending: PendingMessage[] };
type State = {
  conversations: Record<string, api.Conversation>; lists: Record<string, string[]>;
  threads: Record<string, Thread>; errors: Record<string, string>; drafts: Record<string, string>;
  activeId: string | null; connected: boolean;
  loadList: (householdId: string) => Promise<void>;
  sync: (id: string) => Promise<void>; older: (id: string) => Promise<void>;
  send: (id: string, text: string, retryId?: string) => Promise<void>;
  deleteMessages: (id: string, messageIds: string[], scope: 'me' | 'everyone') => Promise<void>;
  clear: (id: string) => Promise<void>;
  read: (id: string, sequence: number) => Promise<void>;
  mute: (id: string, muted: boolean) => Promise<void>;
  direct: (householdId: string, recipientId: string) => Promise<string>;
  receive: (message: api.Message, summary?: { unreadCount: number; lastReadSequence: number; muted: boolean }) => void;
  receiveDeletion: (deletion: api.MessageDeletion) => void;
  receiveClear: (clear: api.ChatClear) => void;
  receiveRead: (conversationId: string, lastReadSequence: number, unreadCount: number) => void;
  receivePreferences: (conversationId: string, muted: boolean) => void;
  draft: (id: string, text: string) => void;
};
const empty = (): Thread => ({ messages: [], cursor: 0, hasOlder: false, pending: [] });
const data = () => ({ conversations: {}, lists: {}, threads: {}, errors: {}, drafts: {}, activeId: null, connected: false });
// Locks include the session token, so one account's request never blocks another's.
const syncing = new Map<string, Promise<void>>();
const listing = new Map<string, Promise<void>>();
const reading = new Set<string>();
const preferenceVersion = new Map<string, number>();
function reconcile(existing: api.Conversation | undefined, incoming: api.Conversation): api.Conversation {
  if (!existing || incoming.lastReadSequence >= existing.lastReadSequence) return incoming;
  // A GET started before our read request must not restore old unread badges.
  return { ...incoming, lastReadSequence: existing.lastReadSequence, unreadCount: existing.unreadCount };
}
const token = () => { const t = useAuthStore.getState().session?.token; if (!t) throw new Error('Please sign in again.'); return t; };
const current = (t: string) => useAuthStore.getState().session?.token === t;

export const useChatStore = create<State>((set, get) => {
  function accept(message: api.Message, summary?: { unreadCount: number; lastReadSequence: number; muted: boolean }) {
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
      const deleted = new Map(reconciliation.deletedMessages.map(message => [message.id, message]));
      const messages = thread.messages
        .filter(message => !hidden.has(message.id))
        .map(message => deleted.get(message.id) ?? message);
      return { threads: { ...state.threads, [id]: { ...thread, messages } } };
    });
  }
  function fail(id: string, error: unknown, t: string) {
    if (!current(t)) return;
    if (isApiError(error) && error.status === 404) {
      set(state => {
        const conversations = { ...state.conversations }; delete conversations[id];
        const threads = { ...state.threads }; delete threads[id];
        const drafts = { ...state.drafts }; delete drafts[id];
        return { conversations, threads, drafts, errors: { ...state.errors, [id]: 'This chat is no longer available. You may no longer belong to this household.' } };
      });
    } else set(state => ({ errors: { ...state.errors, [id]: errorMessage(error, 'Could not update this chat. Please try again.') } }));
    if (isApiError(error) && error.status === 401) void useAuthStore.getState().logout().catch(() => useAuthStore.setState({ session: null }));
  }
  return {
    ...data(),
    draft: (id, text) => set(state => ({ drafts: { ...state.drafts, [id]: text } })),
    receive: accept,
    receiveDeletion: applyDeletion,
    receiveClear: applyClear,
    receiveRead: (id, lastReadSequence, unreadCount) => set(state => {
      const conversation = state.conversations[id];
      if (!conversation || lastReadSequence < conversation.lastReadSequence) return state;
      return { conversations: { ...state.conversations, [id]: { ...conversation, lastReadSequence, unreadCount } } };
    }),
    receivePreferences: (id, muted) => set(state => {
      const conversation = state.conversations[id];
      return conversation ? { conversations: { ...state.conversations, [id]: { ...conversation, muted } } } : state;
    }),
    loadList: (householdId) => {
      const t = token(), key = `${t}:${householdId}`;
      const running = listing.get(key); if (running) return running;
      const job = (async () => {
        const versions = new Map(preferenceVersion);
        const conversations = await api.listConversations(t, householdId);
        if (!current(t)) return;
        set(state => ({ conversations: { ...state.conversations, ...Object.fromEntries(conversations.map(c => {
          const previous = state.conversations[c.id];
          const next = reconcile(previous, c);
          return [c.id, previous && versions.get(c.id) !== preferenceVersion.get(c.id) ? { ...next, muted: previous.muted } : next];
        })) }, lists: { ...state.lists, [householdId]: conversations.map(c => c.id) } }));
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
          const conversation = await api.getConversation(t, id);
          if (!current(t)) return;
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
    send: async (id, text, retryId) => {
      const t = token();
      const clientMessageId = retryId ?? `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
      if (!text.trim() || text.length > 4000 || !get().conversations[id]?.canSend) return;
      const pending = get().threads[id]?.pending.find(p => p.clientMessageId === clientMessageId);
      if (pending?.status === 'sending') return;
      set(state => {
        const thread = state.threads[id] ?? empty();
        return { drafts: retryId ? state.drafts : { ...state.drafts, [id]: '' }, threads: { ...state.threads, [id]: { ...thread, pending: [...thread.pending.filter(p => p.clientMessageId !== clientMessageId), { clientMessageId, text, createdAt: pending?.createdAt ?? new Date().toISOString(), status: 'sending' }] } } };
      });
      try { const message = await api.sendMessage(t, id, clientMessageId, text); if (current(t)) accept(message); }
      catch (error) {
        if (current(t)) set(state => {
          const thread = state.threads[id]; if (!thread) return state;
          return { threads: { ...state.threads, [id]: { ...thread, pending: thread.pending.map(p => p.clientMessageId === clientMessageId ? { ...p, status: 'failed', error: errorMessage(error, 'Could not send. Tap to retry.') } : p) } } };
        });
        if (isApiError(error) && (error.status === 404 || error.status === 401)) fail(id, error, t);
        if (isApiError(error) && error.status === 403) void get().sync(id).catch(() => {});
      }
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
      const t = token(), c = await api.startDirect(t, householdId, recipientId);
      if (!current(t)) throw new Error('Your session changed. Please try again.');
      set(state => ({ conversations: { ...state.conversations, [c.id]: c } }));
      return c.id;
    },
  };
});
useAuthStore.subscribe((state, previous) => {
  if (state.session?.token !== previous.session?.token) { preferenceVersion.clear(); useChatStore.setState(data()); }
});
