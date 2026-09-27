import type { ChatPhoto, Conversation, Message, MessageReceipt, Receipt, ReceiptEvent } from '@/api/chat';

// The photo a message carries, if any. A message deleted for everyone has lost its photo too.
export function messagePhoto(message: Pick<Message, 'images' | 'deletedAt'>): ChatPhoto | undefined {
  return message.deletedAt ? undefined : message.images?.[0];
}
// One line standing for a message, as the chat list and "Message info" show it: the text, or a
// camera with the caption for a photo.
export function messageSummary(message: Pick<Message, 'text' | 'images' | 'deletedAt'>): string {
  if (message.deletedAt) return 'This message was deleted.';
  if (!messagePhoto(message)) return message.text;
  return message.text ? `📷 ${message.text}` : '📷 Photo';
}
// The same for a screen reader, which would read the emoji out as "camera".
export function messageSpokenText(message: Pick<Message, 'text' | 'images' | 'deletedAt'>): string {
  if (message.deletedAt || !messagePhoto(message)) return messageSummary(message);
  return message.text ? `Photo, ${message.text}` : 'Photo';
}

// Two copies of one message: the one that reflects more of what happened to it wins. A deletion is
// final; otherwise the later edit wins, and an equal one takes the incoming copy. So a page fetched
// before an edit or a deletion cannot undo it when it lands late.
export function newerMessage(current: Message, incoming: Message): Message {
  if (incoming.deletedAt) return incoming;
  if (current.deletedAt) return current;
  const editTime = (message: Message) => message.editedAt ? Date.parse(message.editedAt) : 0;
  return editTime(incoming) >= editTime(current) ? incoming : current;
}
export function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  const messages = new Map(existing.map(m => [m.id, m]));
  for (const message of incoming) {
    const current = messages.get(message.id);
    messages.set(message.id, current ? newerMessage(current, message) : message);
  }
  return [...messages.values()].sort((a, b) => a.sequence - b.sequence);
}
// Whether a bubble says "Edited". A deleted message has nothing left to show as edited.
export function isEdited(message: Pick<Message, 'editedAt' | 'deletedAt'>): boolean {
  return !!message.editedAt && !message.deletedAt;
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
// In the household chat a person's picture and name head each run of their messages, the way
// WhatsApp groups them, instead of repeating on every bubble. A run starts when the message before
// it came from someone else, was an unsent one, or fell on an earlier day. `previous` is the older
// neighbour, or undefined at the start of the conversation.
export function startsSenderRun(message: Pick<Message, 'senderId' | 'createdAt'>, previous: Pick<Message, 'senderId' | 'createdAt'> | undefined): boolean {
  return !previous || previous.senderId !== message.senderId || messageDay(previous.createdAt) !== messageDay(message.createdAt);
}
export type MessageStatus = 'sent' | 'delivered' | 'read';
// The ticks under one of your own messages. In a household chat the slowest person decides, as on
// WhatsApp: two ticks once it has reached everyone, coloured once everyone has read it.
// Someone counts for a message when they joined before it was sent, or when it has reached them
// anyway. So a newly invited member does not turn old, read messages back to "sent", and still
// counts once they open the history.
export function messageStatus(message: Pick<Message, 'sequence' | 'createdAt'>, receipts: Receipt[] | undefined): MessageStatus {
  const sentAt = Date.parse(message.createdAt);
  const counted = (receipts ?? []).filter(r => r.deliveredSequence >= message.sequence || Date.parse(r.joinedAt) <= sentAt);
  if (!counted.length) return 'sent';
  if (counted.every(r => r.readSequence >= message.sequence)) return 'read';
  return counted.every(r => r.deliveredSequence >= message.sequence) ? 'delivered' : 'sent';
}
// Progress only moves forward. An event that arrives late or twice must not move anyone back, and
// returning the same array when nothing changed spares the chat a re-render.
export function applyReceipt(receipts: Receipt[] | undefined, event: ReceiptEvent): Receipt[] | undefined {
  const current = receipts?.find(r => r.userId === event.userId);
  if (!receipts || !current || (event.deliveredSequence <= current.deliveredSequence && event.readSequence <= current.readSequence)) return receipts;
  return receipts.map(r => r !== current ? r : { ...r,
    deliveredSequence: Math.max(r.deliveredSequence, event.deliveredSequence), readSequence: Math.max(r.readSequence, event.readSequence) });
}
// A fresh summary decides who is in the list. Progress already heard over the socket is kept when
// the summary is older than it, which happens when a request started before the event arrived.
export function mergeReceipts(existing: Receipt[] | undefined, incoming: Receipt[] | undefined): Receipt[] | undefined {
  if (!existing || !incoming) return incoming;
  return incoming.map(next => {
    const known = existing.find(r => r.userId === next.userId);
    return known ? { ...next, deliveredSequence: Math.max(next.deliveredSequence, known.deliveredSequence), readSequence: Math.max(next.readSequence, known.readSequence) } : next;
  });
}
// A person's line in "Message info": "Read 10:02 AM", or just "Read" when no honest time exists.
export function receiptLine(receipt: MessageReceipt, now = Date.now()): string {
  const when = (iso: string | null) => iso ? ' ' + receiptTime(iso, now) : '';
  if (receipt.read) return 'Read' + when(receipt.readAt);
  return receipt.delivered ? 'Delivered' + when(receipt.deliveredAt) : 'Not delivered yet';
}
// Today shows the time alone. Any other day shows the date too, so "10:02" is never ambiguous.
export function receiptTime(iso: string, now = Date.now()): string {
  const date = new Date(iso);
  return date.toDateString() === new Date(now).toDateString() ? messageTime(iso) : `${messageDay(iso)}, ${messageTime(iso)}`;
}
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
const EDIT_WINDOW_MS = 15 * 60_000;
// The moment editing stops being offered for a message: 15 minutes after it was sent. Null when it
// is not on offer at all, because it is someone else's or deleted. The backend checks the same rules.
export function editableUntil(message: Pick<Message, 'senderId' | 'deletedAt' | 'createdAt'>, userId: string): number | null {
  return message.senderId !== userId || message.deletedAt ? null : Date.parse(message.createdAt) + EDIT_WINDOW_MS;
}
export function initial(name: string) { return Array.from(name.trim())[0]?.toUpperCase() || '?'; }
export function messageTime(iso: string) { return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
export function messageDay(iso: string) { return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); }
