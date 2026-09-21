import { apiRequest } from '@/api/client';

export type Message = {
  id: string; conversationId: string; senderId: string; clientMessageId: string;
  sequence: number; text: string; deletedAt: string | null; createdAt: string; sender: { id: string; name: string };
};
export type Conversation = {
  id: string; householdId: string; type: 'HOUSEHOLD' | 'DIRECT';
  createdAt: string; updatedAt: string; participants: { id: string; name: string }[];
  canSend: boolean; latestMessage: Message | null; unreadCount: number; lastReadSequence: number; muted: boolean;
};
export type MessagePage = { messages: Message[]; hasMore: boolean; nextBefore: number | null; nextAfter: number | null; latestSequence: number };
// One deletion covers one message or a batch. `messages` holds the tombstones of an "everyone"
// deletion. It is empty for a "me" deletion, where the messages simply leave this user's view.
export type MessageDeletion = {
  conversationId: string; scope: 'me' | 'everyone';
  messageIds: string[]; messages: Message[]; conversation: Conversation;
};
// "Clear chat" hid every message up to `clearedSequence`, for this user only.
export type ChatClear = { conversationId: string; clearedSequence: number; conversation: Conversation };
export type MessageReconciliation = { hiddenMessageIds: string[]; deletedMessages: Message[] };
export const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const person = (v: unknown): v is { id: string; name: string } => isRecord(v) && typeof v.id === 'string' && typeof v.name === 'string';
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
export function isMessage(v: unknown): v is Message {
  return isRecord(v) && ['id', 'conversationId', 'senderId', 'clientMessageId', 'text', 'createdAt'].every(k => typeof v[k] === 'string') &&
    (v.deletedAt === null || typeof v.deletedAt === 'string') && count(v.sequence) && v.sequence > 0 && person(v.sender);
}
export function isConversation(v: unknown): v is Conversation {
  return isRecord(v) && typeof v.id === 'string' && typeof v.householdId === 'string' &&
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
    !Array.isArray(data.deletedMessages) || !data.deletedMessages.every(isMessage)) throw invalid();
  return data as MessageReconciliation;
}
export async function sendMessage(token: string, id: string, clientMessageId: string, text: string): Promise<Message> {
  const data = await apiRequest(`${path(id)}/messages`, { token, method: 'POST', body: { clientMessageId, text } });
  if (!isRecord(data) || !isMessage(data.message)) throw invalid();
  return data.message;
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
export async function setMuted(token: string, id: string, muted: boolean) {
  await apiRequest(`${path(id)}/preferences`, { token, method: 'PATCH', body: { muted } });
}
