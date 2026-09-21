import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { isSession, SESSION_STORAGE_KEY } from '@/api/auth';
import { isRecord } from '@/api/chat';
import { tokenExpiresAt } from '@/api/token';
import { chatNotificationTarget } from '@/lib/chat-helpers';
import { CHAT_CATEGORY, registerChatCategory } from '@/lib/chat-notification-actions';

import { readSequence, serialized } from '@/lib/chat-notification-cleanup';
export { clearReadChatNotifications } from '@/lib/chat-notification-cleanup';

export function parseChatDelivery(payload: unknown) {
  if (!isRecord(payload) || 'actionIdentifier' in payload) return null;
  let data: unknown = payload.data;
  if (isRecord(data) && typeof data.dataString === 'string') {
    try { data = JSON.parse(data.dataString); } catch { return null; }
  }
  if (!isRecord(data) || data.delivery !== 'chat_local_v1' || !chatNotificationTarget(data) ||
    typeof data.recipientId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(data.recipientId) ||
    typeof data.messageId !== 'string' || !data.messageId ||
    typeof data.sequence !== 'number' || !Number.isSafeInteger(data.sequence) || data.sequence < 1 ||
    typeof data.previewTitle !== 'string' || typeof data.previewBody !== 'string') return null;
  return data;
}

// A data-only remote push reaches this task instead of Firebase's automatic tray renderer.
export function presentChatDelivery(payload: unknown) {
  return serialized(async () => {
    const data = parseChatDelivery(payload);
    if (!data) return;
    const session: unknown = JSON.parse(await SecureStore.getItemAsync(SESSION_STORAGE_KEY) ?? 'null');
    if (!isSession(session) || session.user.id !== data.recipientId || tokenExpiresAt(session.token) <= Date.now()) return;
    const id = data.conversationId as string;
    if (await readSequence(session.user.id, id) >= (data.sequence as number)) return;
    await registerChatCategory();
    const { delivery: _delivery, previewTitle, previewBody, ...chat } = data;
    await Notifications.scheduleNotificationAsync({
      identifier: `chat_${data.recipientId}_${data.messageId}`,
      content: { title: previewTitle as string, body: previewBody as string, categoryIdentifier: CHAT_CATEGORY, data: chat },
      trigger: { channelId: 'chat' },
    });
  });
}
