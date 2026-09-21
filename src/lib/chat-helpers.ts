import type { Conversation, Message } from '@/api/chat';

export function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  const messages = new Map(existing.map(m => [m.id, m]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()].sort((a, b) => a.sequence - b.sequence);
}
export function conversationName(conversation: Conversation, userId: string): string {
  return conversation.type === 'HOUSEHOLD' ? 'Household chat' : conversation.participants.find(p => p.id !== userId)?.name ?? 'Private chat';
}
function chatTarget(data: unknown, type: string): string | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  return value.type === type && typeof value.conversationId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value.conversationId) ? value.conversationId : null;
}
export function chatNotificationTarget(data: unknown): string | null { return chatTarget(data, 'CHAT_MESSAGE'); }
// A "Reply not sent" notice made on this phone. Tapping it opens the chat, but it is not a new
// message, so it must not count as one: no in-app alert, and no hiding while the app is open.
export const REPLY_FAILED = 'CHAT_REPLY_FAILED';
export function replyFailureTarget(data: unknown): string | null { return chatTarget(data, REPLY_FAILED); }
// The most messages one delete may hold. The backend enforces the same number.
export const MAX_SELECTION = 50;
const DELETE_FOR_EVERYONE_WINDOW_MS = 15 * 60_000;
// Selects a message, or unselects it when it is already selected. Returns null when the selection
// is full, so the screen can say so instead of silently ignoring the tap.
export function toggleSelection(selected: string[], id: string, max = MAX_SELECTION): string[] | null {
  if (selected.includes(id)) return selected.filter(item => item !== id);
  return selected.length >= max ? null : [...selected, id];
}
// The moment "Delete for everyone" stops being offered for these messages: when the oldest one
// turns 15 minutes old. Null when it is not on offer at all, because one of them belongs to
// someone else or is already deleted. The backend checks the same rules again.
export function deleteForEveryoneUntil(messages: Message[], userId: string): number | null {
  if (!messages.length || messages.some(message => message.senderId !== userId || message.deletedAt)) return null;
  return Math.min(...messages.map(message => Date.parse(message.createdAt))) + DELETE_FOR_EVERYONE_WINDOW_MS;
}
export function initial(name: string) { return Array.from(name.trim())[0]?.toUpperCase() || '?'; }
export function messageTime(iso: string) { return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
export function messageDay(iso: string) { return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); }
