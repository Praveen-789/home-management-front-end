import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { chatNotificationTarget } from '@/lib/chat-helpers';

const readKey = (userId: string, id: string) => `chat-read.${userId}.${id}`;
const reads = new Map<string, number>();
let queue: Promise<unknown> = Promise.resolve();
export function serialized<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => {});
  return next;
}
export async function readSequence(userId: string, id: string) {
  const key = readKey(userId, id);
  const stored = Number(await SecureStore.getItemAsync(key));
  return Math.max(reads.get(key) ?? 0, Number.isSafeInteger(stored) ? stored : 0);
}

// Used after a confirmed read, including reads synchronized from another device.
export function clearReadChatNotifications(userId: string, id: string, sequence: number) {
  return serialized(async () => {
    const key = readKey(userId, id);
    const upTo = Math.max(sequence, await readSequence(userId, id));
    reads.set(key, upTo);
    await SecureStore.setItemAsync(key, String(upTo));
    const presented = await Notifications.getPresentedNotificationsAsync();
    for (const { request } of presented) {
      const data = request.content.data;
      if (data?.recipientId === userId && chatNotificationTarget(data) === id &&
        typeof data.sequence === 'number' && data.sequence <= upTo) {
        await Notifications.dismissNotificationAsync(request.identifier);
      }
    }
  });
}

