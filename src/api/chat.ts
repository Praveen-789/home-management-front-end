import { apiRequest } from '@/api/client';
import { uploadWithTicket, type ImageFile, type ImageInput } from '@/api/images';

// `text` is the message, or the caption of its photo, which may be empty. `images` holds at most one
// photo for now, and is missing from a backend without chat photos. `editedAt` is when the sender
// last changed the text: null when never edited, missing from a backend without editing.
export type Message = {
  id: string; conversationId: string; senderId: string; clientMessageId: string;
  sequence: number; text: string; deletedAt: string | null; createdAt: string; sender: ChatPerson;
  images?: ChatPhoto[]; editedAt?: string | null;
};
// A photo sent in a chat. The sender uploaded it, so unlike a task photo it names no uploader.
export type ChatPhoto = { id: string; url: string; thumbnailUrl: string; width: number; height: number; bytes: number; format: string; createdAt: string };
// Chat shows people without their email address.
export type ChatPerson = { id: string; name: string; avatarUrl?: string | null };
export type Conversation = {
  id: string; householdId: string; type: 'HOUSEHOLD' | 'DIRECT';
  createdAt: string; updatedAt: string; participants: ChatPerson[];
  canSend: boolean; latestMessage: Message | null; unreadCount: number; lastReadSequence: number; muted: boolean;
  // How far every other member has received and read. Missing from a backend without receipts.
  receipts?: Receipt[];
};
// One other member's progress through a conversation. Two numbers tick every message in it:
// message N has reached them when deliveredSequence >= N, and they have read it when readSequence >= N.
export type Receipt = { userId: string; joinedAt: string; deliveredSequence: number; readSequence: number };
// Sent to everyone else when someone's progress moves.
export type ReceiptEvent = { conversationId: string; userId: string; deliveredSequence: number; readSequence: number };
// One person's line in "Message info". A null time with delivered or read true means it happened,
// but the backend has no honest time for it.
export type MessageReceipt = { user: ChatPerson; delivered: boolean; read: boolean; deliveredAt: string | null; readAt: string | null };
export type MessagePage = { messages: Message[]; hasMore: boolean; nextBefore: number | null; nextAfter: number | null; latestSequence: number };
// One deletion covers one message or a batch. `messages` holds the tombstones of an "everyone"
// deletion. It is empty for a "me" deletion, where the messages simply leave this user's view.
export type MessageDeletion = {
  conversationId: string; scope: 'me' | 'everyone';
  messageIds: string[]; messages: Message[]; conversation: Conversation;
};
// "Clear chat" hid every message up to `clearedSequence`, for this user only.
export type ChatClear = { conversationId: string; clearedSequence: number; conversation: Conversation };
// `editedMessages` lists every cached message that was ever edited. Missing from a backend without editing.
export type MessageReconciliation = { hiddenMessageIds: string[]; deletedMessages: Message[]; editedMessages?: Message[] };
export const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const person = (v: unknown): v is ChatPerson => isRecord(v) && typeof v.id === 'string' && typeof v.name === 'string';
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const isChatPhoto = (v: unknown): v is ChatPhoto =>
  isRecord(v) && ['id', 'url', 'thumbnailUrl', 'format', 'createdAt'].every(k => typeof v[k] === 'string') && count(v.width) && count(v.height) && count(v.bytes);
export function isMessage(v: unknown): v is Message {
  return isRecord(v) && ['id', 'conversationId', 'senderId', 'clientMessageId', 'text', 'createdAt'].every(k => typeof v[k] === 'string') &&
    (v.deletedAt === null || typeof v.deletedAt === 'string') && count(v.sequence) && v.sequence > 0 && person(v.sender) &&
    (v.images === undefined || (Array.isArray(v.images) && v.images.every(isChatPhoto))) &&
    (v.editedAt === undefined || v.editedAt === null || typeof v.editedAt === 'string');
}
const isReceipt = (v: unknown): v is Receipt =>
  isRecord(v) && typeof v.userId === 'string' && typeof v.joinedAt === 'string' && count(v.deliveredSequence) && count(v.readSequence);
export function isReceiptEvent(v: unknown): v is ReceiptEvent {
  return isRecord(v) && typeof v.conversationId === 'string' && typeof v.userId === 'string' && count(v.deliveredSequence) && count(v.readSequence);
}
const isMessageReceipt = (v: unknown): v is MessageReceipt =>
  isRecord(v) && person(v.user) && typeof v.delivered === 'boolean' && typeof v.read === 'boolean' &&
  (v.deliveredAt === null || typeof v.deliveredAt === 'string') && (v.readAt === null || typeof v.readAt === 'string');
export function isConversation(v: unknown): v is Conversation {
  return isRecord(v) && typeof v.id === 'string' && typeof v.householdId === 'string' &&
    (v.receipts === undefined || (Array.isArray(v.receipts) && v.receipts.every(isReceipt))) &&
    (v.type === 'DIRECT' || v.type === 'HOUSEHOLD') && Array.isArray(v.participants) && v.participants.every(person) &&
    typeof v.canSend === 'boolean' && typeof v.muted === 'boolean' && count(v.unreadCount) && count(v.lastReadSequence) &&
    typeof v.createdAt === 'string' && typeof v.updatedAt === 'string' && (v.latestMessage === null || isMessage(v.latestMessage));
}
export function isMessageDeletion(v: unknown): v is MessageDeletion {
  return isRecord(v) && typeof v.conversationId === 'string' && (v.scope === 'me' || v.scope === 'everyone') &&
    isConversation(v.conversation) && Array.isArray(v.messageIds) && v.messageIds.length > 0 && v.messageIds.every(id => typeof id === 'string') &&
    Array.isArray(v.messages) && v.messages.every(isMessage) && v.messages.length === (v.scope === 'me' ? 0 : v.messageIds.length);
}
export function isChatClear(v: unknown): v is ChatClear {
  return isRecord(v) && typeof v.conversationId === 'string' && count(v.clearedSequence) && isConversation(v.conversation);
}
const invalid = () => new Error('Could not read the chat response. Please try again.');
const path = (id: string) => `/conversations/${encodeURIComponent(id)}`;
export async function listConversations(token: string, householdId: string): Promise<Conversation[]> {
  const all: Conversation[] = [];
  // Households can have more than one page of private conversations.
  for (let page = 1; ; page++) {
    const data = await apiRequest(`/households/${encodeURIComponent(householdId)}/conversations?limit=100&page=${page}`, { token });
    if (!isRecord(data) || !Array.isArray(data.conversations) || !data.conversations.every(isConversation) || !isRecord(data.pagination) || !count(data.pagination.totalPages)) throw invalid();
    all.push(...data.conversations);
    if (page >= data.pagination.totalPages) return all;
  }
}
export async function getConversation(token: string, id: string): Promise<Conversation> {
  const data = await apiRequest(path(id), { token });
  if (!isRecord(data) || !isConversation(data.conversation)) throw invalid();
  return data.conversation;
}
export async function startDirect(token: string, householdId: string, recipientId: string): Promise<Conversation> {
  const data = await apiRequest(`/households/${encodeURIComponent(householdId)}/conversations/direct`, { token, method: 'POST', body: { recipientId } });
  if (!isRecord(data) || !isConversation(data.conversation)) throw invalid();
  return data.conversation;
}
export async function getMessages(token: string, id: string, cursor?: { before: number } | { after: number }): Promise<MessagePage> {
  const query = cursor ? `&${'before' in cursor ? `before=${cursor.before}` : `after=${cursor.after}`}` : '';
  const data = await apiRequest(`${path(id)}/messages?limit=50${query}`, { token });
  if (!isRecord(data) || !Array.isArray(data.messages) || !data.messages.every(isMessage) || typeof data.hasMore !== 'boolean' || !count(data.latestSequence) || !(data.nextBefore === null || count(data.nextBefore)) || !(data.nextAfter === null || count(data.nextAfter))) throw invalid();
  return data as MessagePage;
}
export async function reconcileMessages(token: string, id: string, messageIds: string[]): Promise<MessageReconciliation> {
  const data = await apiRequest(`${path(id)}/messages/reconcile`, { token, method: 'POST', body: { messageIds } });
  if (!isRecord(data) || !Array.isArray(data.hiddenMessageIds) || !data.hiddenMessageIds.every(value => typeof value === 'string') ||
    !Array.isArray(data.deletedMessages) || !data.deletedMessages.every(isMessage) ||
    !(data.editedMessages === undefined || (Array.isArray(data.editedMessages) && data.editedMessages.every(isMessage)))) throw invalid();
  return data as MessageReconciliation;
}
// Changes the text of the user's own message, or its photo's caption. The backend allows it for
// 15 minutes after sending, and answers with the message as it now stands.
export async function editMessage(token: string, id: string, messageId: string, text: string): Promise<Message> {
  const data = await apiRequest(`${path(id)}/messages/${encodeURIComponent(messageId)}`, { token, method: 'PATCH', body: { text } });
  if (!isRecord(data) || !isMessage(data.message)) throw invalid();
  return data.message;
}
// `images` are photos already uploaded with uploadChatPhoto. With a photo, the text is its caption
// and may be empty.
export async function sendMessage(token: string, id: string, clientMessageId: string, text: string, images: ImageInput[] = []): Promise<Message> {
  const data = await apiRequest(`${path(id)}/messages`, { token, method: 'POST', body: { clientMessageId, text, ...(images.length ? { images } : {}) } });
  if (!isRecord(data) || !isMessage(data.message)) throw invalid();
  return data.message;
}
// Uploads a photo into this conversation's own folder, ready to send. The backend signs the upload
// only for someone who may send here.
export function uploadChatPhoto(token: string, id: string, file: ImageFile): Promise<ImageInput> {
  return uploadWithTicket(token, `${path(id)}/uploads`, file);
}
// One message or many: a single delete is a list of one. The backend deletes all of them or none.
export async function deleteMessages(token: string, id: string, messageIds: string[], scope: 'me' | 'everyone'): Promise<MessageDeletion> {
  const data = await apiRequest(`${path(id)}/messages/delete`, { token, method: 'POST', body: { messageIds, scope } });
  if (!isRecord(data) || !isRecord(data.deletion) || !isConversation(data.conversation)) throw invalid();
  const deletion = { ...data.deletion, conversation: data.conversation };
  if (!isMessageDeletion(deletion)) throw invalid();
  return deletion;
}
export async function clearConversation(token: string, id: string): Promise<ChatClear> {
  const data = await apiRequest(`${path(id)}/clear`, { token, method: 'POST' });
  if (!isChatClear(data)) throw invalid();
  return data;
}
export async function markRead(token: string, id: string, sequence: number) {
  const data = await apiRequest(`${path(id)}/read`, { token, method: 'PATCH', body: { sequence } });
  if (!isRecord(data) || !count(data.lastReadSequence) || !count(data.unreadCount)) throw invalid();
  return { lastReadSequence: data.lastReadSequence, unreadCount: data.unreadCount };
}
// Tells the backend that messages up to `sequence` have reached this phone.
export async function markDelivered(token: string, id: string, sequence: number): Promise<void> {
  await apiRequest(`${path(id)}/delivered`, { token, method: 'PATCH', body: { sequence } });
}
// "Message info": who a message reached and who read it. The backend answers only its sender.
export async function getMessageReceipts(token: string, id: string, messageId: string): Promise<MessageReceipt[]> {
  const data = await apiRequest(`${path(id)}/messages/${encodeURIComponent(messageId)}/receipts`, { token });
  if (!isRecord(data) || !Array.isArray(data.receipts) || !data.receipts.every(isMessageReceipt)) throw invalid();
  return data.receipts;
}
export async function setMuted(token: string, id: string, muted: boolean) {
  await apiRequest(`${path(id)}/preferences`, { token, method: 'PATCH', body: { muted } });
}
