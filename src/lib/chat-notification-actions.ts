import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { isSession, SESSION_STORAGE_KEY, type Session } from '@/api/auth';
import { isRecord, markRead, sendMessage } from '@/api/chat';
import { tokenExpiresAt } from '@/api/token';
import { clearReadChatNotifications } from '@/lib/chat-notification-cleanup';
import { chatNotificationTarget, REPLY_FAILED } from '@/lib/chat-helpers';

// The backend sends this category with every chat push. Expo does not allow ":" or "-" in it.
export const CHAT_CATEGORY = 'chat_message';
export const REPLY_ACTION = 'reply';
export const MARK_READ_ACTION = 'mark_read';

export type ChatAction = {
  kind: 'reply' | 'read';
  notificationId: string; conversationId: string; recipientId: string;
  // The message the alert was about. Mark as read moves the read cursor here.
  sequence: number;
  // What the person typed. Empty for Mark as read.
  text: string;
};

// The two buttons under a chat alert. Neither opens the app, which is the whole point.
export function registerChatCategory() {
  return Notifications.setNotificationCategoryAsync(CHAT_CATEGORY, [
    { identifier: REPLY_ACTION, buttonTitle: 'Reply', textInput: { submitButtonTitle: 'Send', placeholder: 'Message' }, options: { opensAppToForeground: false } },
    { identifier: MARK_READ_ACTION, buttonTitle: 'Mark as read', options: { opensAppToForeground: false } },
  ]);
}

// Reads a button press. A running app gets the payload already parsed in `content.data`. The
// background task gets Android's raw version, where the same payload is a JSON string in
// `content.dataString`. Anything unexpected returns null, and nothing is sent.
export function parseChatAction(response: unknown): ChatAction | null {
  if (!isRecord(response) || !isRecord(response.notification) || !isRecord(response.notification.request)) return null;
  const kind = response.actionIdentifier === REPLY_ACTION ? 'reply' : response.actionIdentifier === MARK_READ_ACTION ? 'read' : null;
  const { identifier, content } = response.notification.request;
  if (!kind || typeof identifier !== 'string' || !identifier || !isRecord(content)) return null;
  let data: unknown = content.data;
  if (!isRecord(data) && typeof content.dataString === 'string') {
    try { data = JSON.parse(content.dataString); } catch { return null; }
  }
  const conversationId = chatNotificationTarget(data);
  if (!conversationId || !isRecord(data) || typeof data.recipientId !== 'string' || !data.recipientId) return null;
  if (typeof data.sequence !== 'number' || !Number.isSafeInteger(data.sequence) || data.sequence < 1) return null;
  const text = kind === 'reply' && typeof response.userText === 'string' ? response.userText.trim() : '';
  if (kind === 'reply' && !text) return null;
  return { kind, notificationId: identifier, conversationId, recipientId: data.recipientId, sequence: data.sequence, text };
}

// The same press always gives the same ID. Android can deliver one press twice, to the running app
// and to the background task, and the backend keeps a repeated `clientMessageId` as one message.
export function replyMessageId(notificationId: string, text: string): string {
  let hash = 2166136261;
  for (const char of `${notificationId}\n${text}`) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
  return `nr_${notificationId.replace(/[^A-Za-z0-9]/g, '').slice(-80)}_${(hash >>> 0).toString(36).padStart(7, '0')}`;
}

// One notice per chat, so a second failure replaces the first instead of stacking up.
const failureId = (conversationId: string) => `reply_failed_${conversationId}`;

async function savedSession(): Promise<Session | null> {
  try {
    const session: unknown = JSON.parse(await SecureStore.getItemAsync(SESSION_STORAGE_KEY) ?? 'null');
    return isSession(session) && tokenExpiresAt(session.token) > Date.now() ? session : null;
  } catch { return null; }
}

async function replyFailed(action: ChatAction) {
  // Android shows a spinner on the alert until it changes, so the alert makes way for the notice.
  await Notifications.dismissNotificationAsync(action.notificationId).catch(() => {});
  const preview = Array.from(action.text).slice(0, 80).join('');
  await Notifications.scheduleNotificationAsync({
    identifier: failureId(action.conversationId),
    content: { title: 'Reply not sent', body: `"${preview}" was not sent. Tap to open the chat.`, data: { type: REPLY_FAILED, conversationId: action.conversationId } },
    trigger: { channelId: 'chat' },
  }).catch(() => {});
}

// Clears every alert of this chat that is now read, not only the one that was pressed.
async function dismissReadAlerts(action: ChatAction, readUpTo: number) {
  const presented = await Notifications.getPresentedNotificationsAsync().catch(() => []);
  const read = presented.filter(({ request }) => {
    const data = request.content.data;
    return chatNotificationTarget(data) === action.conversationId && typeof data?.sequence === 'number' && data.sequence <= readUpTo;
  }).map(({ request }) => request.identifier);
  for (const id of new Set([action.notificationId, failureId(action.conversationId), ...read])) {
    await Notifications.dismissNotificationAsync(id).catch(() => {});
  }
}

async function run(action: ChatAction) {
  const session = await savedSession();
  // Signed out, expired, or an alert addressed to an account that no longer uses this phone.
  if (session?.user.id !== action.recipientId) {
    if (action.kind === 'reply') await replyFailed(action);
    return;
  }
  let readUpTo = action.sequence;
  if (action.kind === 'reply') {
    try {
      // The reply becomes the newest message, so reading up to it reads everything it answers.
      readUpTo = (await sendMessage(session.token, action.conversationId, replyMessageId(action.notificationId, action.text), action.text)).sequence;
    } catch { await replyFailed(action); return; }
  }
  const read = await markRead(session.token, action.conversationId, readUpTo).then(() => true, () => false);
  // A failed Mark as read leaves the alert where it is, so it can be pressed again.
  if (read) await clearReadChatNotifications(action.recipientId, action.conversationId, readUpTo).catch(() => {});
  if (read || action.kind === 'reply') await dismissReadAlerts(action, readUpTo);
}

const running = new Map<string, Promise<void>>();
// Handles a Reply or Mark as read press and ignores every other payload. It never throws, because
// there is no screen to show an error on. A failed reply becomes a "Reply not sent" notice instead.
export function handleChatAction(response: unknown): Promise<void> {
  const action = parseChatAction(response);
  if (!action) return Promise.resolve();
  const key = `${action.kind}:${action.notificationId}`;
  let work = running.get(key);
  if (!work) {
    work = run(action).catch(() => {}).finally(() => running.delete(key));
    running.set(key, work);
  }
  return work;
}
