import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createStore } from 'zustand/vanilla';
import { mergeMessages, conversationName, chatNotificationTarget, toggleSelection, deleteForEveryoneUntil, MAX_SELECTION } from '../src/lib/chat-helpers.ts';
import { notificationTarget } from '../src/lib/notification-helpers.ts';

const root = fileURLToPath(new URL('../src/', import.meta.url));
const auth = createStore(() => ({ session: null, logout: async () => auth.setState({ session: null }) }));
let request = async () => { throw new Error('Unexpected request'); };
globalThis.__chatTest = { auth, request: (...args) => request(...args) };
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@/stores/auth-store') return { url: 'chat-test:auth', shortCircuit: true };
    if (specifier === '@/api/client') return { url: 'chat-test:client', shortCircuit: true };
    if (specifier === '@/stores/notification-store') return { url: 'chat-test:inbox', shortCircuit: true };
    if (specifier.startsWith('@/')) return next(pathToFileURL(resolve(root, specifier.slice(2) + '.ts')).href, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    const sources = {
      'chat-test:auth': 'export const useAuthStore = globalThis.__chatTest.auth;',
      'chat-test:client': 'export const apiRequest = (...args) => globalThis.__chatTest.request(...args); export const isApiError = e => e?.name === "ApiError";',
      'chat-test:inbox': 'export const useNotificationStore = { getState: () => ({ refreshUnreadCount: async () => {} }) };',
    };
    return sources[url] ? { format: 'module', source: sources[url], shortCircuit: true } : next(url, context);
  },
});
const { useChatStore: store } = await import('../src/stores/chat-store.ts');
const { isMessageDeletion, isChatClear } = await import('../src/api/chat.ts');
const message = (sequence, senderId = 'bob', clientMessageId = 'client-' + sequence) => ({
  id: 'm-' + sequence, conversationId: 'chat', senderId, clientMessageId, sequence, text: 'Message ' + sequence,
  deletedAt: null, createdAt: '2026-09-20T10:00:00Z', sender: { id: senderId, name: senderId },
});
const conversation = (extra = {}) => ({
  id: 'chat', householdId: 'home', type: 'DIRECT', participants: [{ id: 'alice', name: 'Alice' }, { id: 'bob', name: 'Bob' }],
  createdAt: '2026-09-20T10:00:00Z', updatedAt: '2026-09-20T10:00:00Z', canSend: true, muted: false, lastReadSequence: 0,
  unreadCount: 6, latestMessage: message(6), ...extra,
});
const page = (numbers, latestSequence, hasMore = false) => ({
  messages: numbers.map(n => message(n)), latestSequence, hasMore, nextBefore: hasMore ? numbers[0] : null, nextAfter: null,
});
const noDeletionChanges = { hiddenMessageIds: [], deletedMessages: [] };
function login() { auth.setState({ session: { token: 'session-' + Math.random(), user: { id: 'alice' } } }); }
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
test('merge handles duplicate delivery, out-of-order arrival and overlapping history without mutation', () => {
  const existing = [message(2), message(4)];
  assert.deepEqual(mergeMessages(existing, [message(3), message(2), message(1)]).map(m => m.sequence), [1, 2, 3, 4]);
  assert.deepEqual(existing.map(m => m.sequence), [2, 4]);
});
test('chat targets validate push data and route inbox entries to the conversation', () => {
  assert.equal(chatNotificationTarget({ type: 'CHAT_MESSAGE', conversationId: 'abc-123' }), 'abc-123');
  for (const data of [null, {}, { type: 'CHAT_MESSAGE', conversationId: '../login' }, { type: 'TASK_ASSIGNED', conversationId: 'abc' }]) assert.equal(chatNotificationTarget(data), null);
  assert.deepEqual(notificationTarget({ type: 'CHAT_MESSAGE', householdId: 'home', entityId: 'chat' }), { kind: 'chat', householdId: 'home', conversationId: 'chat' });
  assert.equal(conversationName(conversation(), 'alice'), 'Bob');
});
test('socket deletion events replace an everyone tombstone and remove a private copy', () => {
  login();
  const original = message(20, 'alice');
  store.setState({
    conversations: { chat: conversation({ latestMessage: original }) },
    threads: { chat: { messages: [original], cursor: 20, hasOlder: false, pending: [] } },
  });
  const deleted = { ...original, text: '', deletedAt: '2026-09-20T10:01:00Z' };
  store.getState().receiveDeletion({
    conversationId: 'chat', messageIds: [original.id], scope: 'everyone', messages: [deleted],
    conversation: conversation({ latestMessage: deleted, unreadCount: 0 }),
  });
  assert.equal(store.getState().threads.chat.messages[0].deletedAt, deleted.deletedAt);
  store.getState().receiveDeletion({
    conversationId: 'chat', messageIds: [original.id], scope: 'me', messages: [],
    conversation: conversation({ latestMessage: null, unreadCount: 0 }),
  });
  assert.equal(store.getState().threads.chat.messages.length, 0);
  assert.equal(store.getState().conversations.chat.latestMessage, null);
});
test('a batch deletion changes every listed message in one update and leaves the rest alone', () => {
  login();
  const mine = [message(1, 'alice'), message(2, 'alice'), message(3, 'alice'), message(4, 'alice')];
  store.setState({
    conversations: { chat: conversation() },
    threads: { chat: { messages: mine, cursor: 4, hasOlder: false, pending: [] } },
  });
  const tombstones = [mine[0], mine[1]].map(m => ({ ...m, text: '', deletedAt: '2026-09-20T10:01:00Z' }));
  store.getState().receiveDeletion({ conversationId: 'chat', scope: 'everyone', messageIds: ['m-1', 'm-2'], messages: tombstones, conversation: conversation() });
  assert.deepEqual(store.getState().threads.chat.messages.map(m => !!m.deletedAt), [true, true, false, false]);
  store.getState().receiveDeletion({ conversationId: 'chat', scope: 'me', messageIds: ['m-2', 'm-3'], messages: [], conversation: conversation() });
  assert.deepEqual(store.getState().threads.chat.messages.map(m => m.id), ['m-1', 'm-4']);
});
test('deleting sends the whole selection in one request', async () => {
  login();
  store.setState({
    conversations: { chat: conversation() },
    threads: { chat: { messages: [message(1), message(2), message(3)], cursor: 3, hasOlder: false, pending: [] } },
  });
  const calls = [];
  request = async (path, options) => {
    calls.push({ path, options });
    return { deletion: { conversationId: 'chat', scope: 'me', messageIds: ['m-1', 'm-3'], messages: [] }, conversation: conversation({ unreadCount: 1 }) };
  };
  await store.getState().deleteMessages('chat', ['m-1', 'm-3'], 'me');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].path.endsWith('/conversations/chat/messages/delete'));
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(calls[0].options.body, { messageIds: ['m-1', 'm-3'], scope: 'me' });
  assert.deepEqual(store.getState().threads.chat.messages.map(m => m.id), ['m-2']);
  assert.equal(store.getState().conversations.chat.unreadCount, 1);
});
test('deletion and clear payloads are checked before they reach the store', () => {
  const base = { conversationId: 'chat', conversation: conversation() };
  assert.ok(isMessageDeletion({ ...base, scope: 'me', messageIds: ['m-1', 'm-2'], messages: [] }));
  assert.ok(isMessageDeletion({ ...base, scope: 'everyone', messageIds: ['m-1'], messages: [message(1)] }));
  for (const bad of [
    { ...base, scope: 'me', messageIds: [], messages: [] },
    { ...base, scope: 'me', messageIds: ['m-1'], messages: [message(1)] },
    { ...base, scope: 'everyone', messageIds: ['m-1', 'm-2'], messages: [message(1)] },
    { ...base, scope: 'everyone', messageIds: [1], messages: [message(1)] },
    { ...base, scope: 'me', messageId: 'm-1', message: null },
  ]) assert.equal(isMessageDeletion(bad), false);
  assert.ok(isChatClear({ ...base, clearedSequence: 0 }));
  for (const bad of [{ ...base }, { ...base, clearedSequence: -1 }, { conversationId: 'chat', clearedSequence: 3 }]) assert.equal(isChatClear(bad), false);
});
test('selection toggles, stops at the limit and still lets a full selection shrink', () => {
  assert.deepEqual(toggleSelection([], 'a'), ['a']);
  assert.deepEqual(toggleSelection(['a', 'b'], 'a'), ['b']);
  const original = ['a'];
  toggleSelection(original, 'b');
  assert.deepEqual(original, ['a']);
  const full = Array.from({ length: MAX_SELECTION }, (_, i) => 'm-' + i);
  assert.equal(MAX_SELECTION, 50);
  assert.equal(toggleSelection(full, 'one-too-many'), null);
  assert.equal(toggleSelection(full, 'm-0').length, MAX_SELECTION - 1);
});
test('delete for everyone needs every message to be mine, intact and inside the window', () => {
  const at = (sequence, senderId, createdAt, deletedAt = null) => ({ ...message(sequence, senderId), createdAt, deletedAt });
  const older = at(1, 'alice', '2026-09-20T10:00:00Z'), newer = at(2, 'alice', '2026-09-20T10:05:00Z');
  // The oldest message decides when the offer ends.
  assert.equal(deleteForEveryoneUntil([newer, older], 'alice'), Date.parse('2026-09-20T10:15:00Z'));
  assert.equal(deleteForEveryoneUntil([newer], 'alice'), Date.parse('2026-09-20T10:20:00Z'));
  assert.equal(deleteForEveryoneUntil([], 'alice'), null);
  assert.equal(deleteForEveryoneUntil([older, at(3, 'bob', '2026-09-20T10:06:00Z')], 'alice'), null);
  assert.equal(deleteForEveryoneUntil([older, at(4, 'alice', '2026-09-20T10:06:00Z', '2026-09-20T10:07:00Z')], 'alice'), null);
});
test('clearing a chat empties the thread but keeps newer and unsent messages', async () => {
  login();
  const pending = { clientMessageId: 'unsent', text: 'Still typing', createdAt: '2026-09-20T10:00:00Z', status: 'failed' };
  store.setState({
    conversations: { chat: conversation() },
    threads: { chat: { messages: [message(5), message(6), message(7)], cursor: 6, hasOlder: true, pending: [pending] } },
  });
  const paths = [];
  // Message 7 arrived while the request was in flight, so the server's marker stops at 6.
  request = async (path, options) => { paths.push(options.method + ' ' + path); return { conversationId: 'chat', clearedSequence: 6, conversation: conversation({ latestMessage: message(7), unreadCount: 1, lastReadSequence: 6 }) }; };
  await store.getState().clear('chat');
  assert.ok(paths[0].startsWith('POST ') && paths[0].endsWith('/conversations/chat/clear'));
  const thread = store.getState().threads.chat;
  assert.deepEqual(thread.messages.map(m => m.sequence), [7]);
  assert.equal(thread.hasOlder, false);
  assert.equal(thread.cursor, 6);
  assert.deepEqual(thread.pending, [pending]);
  assert.equal(store.getState().conversations.chat.unreadCount, 1);
  // The same event from another of the user's devices clears a chat that is not open here.
  store.setState({ conversations: { chat: conversation() }, threads: {} });
  store.getState().receiveClear({ conversationId: 'chat', clearedSequence: 7, conversation: conversation({ latestMessage: null, unreadCount: 0 }) });
  assert.equal(store.getState().conversations.chat.latestMessage, null);
  assert.equal(store.getState().threads.chat, undefined);
});
test('store recovery, retries and session isolation', async t => {
  await t.test('an out-of-order socket event does not skip missing REST messages', async () => {
    login();
    request = async path => path.endsWith('/chat') ? { conversation: conversation() } : page([5, 6], 6, true);
    await store.getState().sync('chat');
    store.getState().receive(message(9));
    assert.equal(store.getState().threads.chat.cursor, 6);
    const paths = [];
    request = async path => {
      paths.push(path);
      if (path.endsWith('/chat')) return { conversation: conversation() };
      if (path.endsWith('/messages/reconcile')) return noDeletionChanges;
      return page([7, 8, 9], 9);
    };
    await store.getState().sync('chat');
    assert.ok(paths.some(p => p.includes('after=6')));
    assert.deepEqual(store.getState().threads.chat.messages.map(m => m.sequence), [5, 6, 7, 8, 9]);
    assert.equal(store.getState().threads.chat.cursor, 9);
    assert.equal(store.getState().threads.chat.hasOlder, true);
  });
  await t.test('all recovery pages are read before moving to the latest watermark', async () => {
    const paths = [];
    request = async path => {
      paths.push(path);
      if (path.endsWith('/chat')) return { conversation: conversation() };
      if (path.endsWith('/messages/reconcile')) return noDeletionChanges;
      if (path.includes('after=9')) return { ...page([10, 11], 13, true), nextAfter: 11 };
      return page([12, 13], 13);
    };
    await store.getState().sync('chat');
    assert.ok(paths.some(p => p.includes('after=11')));
    assert.equal(store.getState().threads.chat.cursor, 13);
  });
  await t.test('foreground recovery reconciles deletions missed while the socket was disconnected', async () => {
    const cached = message(30);
    store.setState({
      conversations: { chat: conversation({ latestMessage: cached }) },
      threads: { chat: { messages: [cached], cursor: 30, hasOlder: false, pending: [] } },
    });
    request = async path => {
      if (path.endsWith('/chat')) return { conversation: conversation({ latestMessage: null }) };
      if (path.endsWith('/messages/reconcile')) return { hiddenMessageIds: [cached.id], deletedMessages: [] };
      return page([], 30);
    };
    await store.getState().sync('chat');
    assert.equal(store.getState().threads.chat.messages.length, 0);
  });
  await t.test('retry reuses the same idempotency key and optimistic rows disappear after confirmation', async () => {
    const sent = [];
    request = async (path, options) => {
      if (options?.method === 'POST') { sent.push(options.body); throw new Error('Connection lost'); }
      return path.endsWith('/chat') ? { conversation: conversation() } : page([], 13);
    };
    await store.getState().send('chat', 'Hello Bob');
    const pending = store.getState().threads.chat.pending[0];
    assert.equal(pending.status, 'failed');
    await store.getState().send('chat', pending.text, pending.clientMessageId);
    assert.deepEqual(sent[0], sent[1]);
    store.getState().receive(message(14, 'alice', pending.clientMessageId));
    assert.equal(store.getState().threads.chat.pending.length, 0);
  });
  await t.test('a late read response cannot overwrite a different signed-in account', async () => {
    const gate = deferred();
    request = () => gate.promise;
    const work = store.getState().read('chat', 10);
    login();
    gate.resolve({ lastReadSequence: 10, unreadCount: 0 });
    await work;
    assert.deepEqual(store.getState().conversations, {});
  });
  await t.test('signing out discards an in-flight conversation request', async () => {
    const gate = deferred();
    request = () => gate.promise;
    const work = store.getState().sync('chat');
    auth.setState({ session: null });
    gate.resolve({ conversation: conversation() });
    await work;
    assert.deepEqual(store.getState().threads, {});
    assert.deepEqual(store.getState().conversations, {});
  });
  await t.test('lost access removes history and drafts instead of leaving private content onscreen', async () => {
    login();
    request = async path => path.endsWith('/chat') ? { conversation: conversation() } : page([1], 1);
    await store.getState().sync('chat');
    store.getState().draft('chat', 'A private draft');
    request = async () => { const e = new Error('Not found'); e.name = 'ApiError'; e.status = 404; throw e; };
    await assert.rejects(store.getState().sync('chat'));
    assert.equal(store.getState().threads.chat, undefined);
    assert.equal(store.getState().drafts.chat, undefined);
    assert.match(store.getState().errors.chat, /no longer available/);
  });
});
