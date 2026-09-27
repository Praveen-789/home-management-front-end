import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createStore } from 'zustand/vanilla';
import { applyReceipt, mergeReceipts, messageStatus, receiptLine, receiptTime } from '../src/lib/chat-helpers.ts';

// The real chat store runs against a fake session and a fake network, as in chat.test.mjs.
const root = fileURLToPath(new URL('../src/', import.meta.url));
const auth = createStore(() => ({ session: null, logout: async () => auth.setState({ session: null }) }));
let request = async () => { throw new Error('Unexpected request'); };
globalThis.__receiptTest = { auth, request: (...args) => request(...args) };
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@/stores/auth-store') return { url: 'receipt-test:auth', shortCircuit: true };
    if (specifier === '@/api/client') return { url: 'receipt-test:client', shortCircuit: true };
    if (specifier === '@/stores/notification-store') return { url: 'receipt-test:inbox', shortCircuit: true };
    // The real upload module needs Expo's file system, which Node cannot load. Receipts never upload.
    if (specifier === '@/api/images') return { url: 'receipt-test:images', shortCircuit: true };
    if (specifier.startsWith('@/')) return next(pathToFileURL(resolve(root, specifier.slice(2) + '.ts')).href, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    const sources = {
      'receipt-test:auth': 'export const useAuthStore = globalThis.__receiptTest.auth;',
      'receipt-test:client': 'export const apiRequest = (...args) => globalThis.__receiptTest.request(...args); export const isApiError = e => e?.name === "ApiError";',
      'receipt-test:inbox': 'export const useNotificationStore = { getState: () => ({ refreshUnreadCount: async () => {} }) };',
      'receipt-test:images': 'export const uploadWithTicket = async () => { throw new Error("Unexpected upload"); };',
    };
    return sources[url] ? { format: 'module', source: sources[url], shortCircuit: true } : next(url, context);
  },
});
const { useChatStore: store } = await import('../src/stores/chat-store.ts');
const { isConversation, isReceiptEvent, getMessageReceipts } = await import('../src/api/chat.ts');

const sentAt = '2026-09-20T10:00:00Z';
const message = (sequence, senderId = 'bob') => ({
  id: 'm-' + sequence, conversationId: 'chat', senderId, clientMessageId: 'client-' + sequence, sequence, text: 'Message ' + sequence,
  deletedAt: null, createdAt: sentAt, sender: { id: senderId, name: senderId },
});
// Someone who was already in the chat when the message was sent, unless `joinedAt` says otherwise.
const person = (userId, deliveredSequence, readSequence, joinedAt = '2026-09-01T00:00:00Z') => ({ userId, joinedAt, deliveredSequence, readSequence });
const conversation = (extra = {}) => ({
  id: 'chat', householdId: 'home', type: 'DIRECT', participants: [{ id: 'alice', name: 'Alice' }, { id: 'bob', name: 'Bob' }],
  createdAt: sentAt, updatedAt: sentAt, canSend: true, muted: false, lastReadSequence: 0, unreadCount: 0, latestMessage: null,
  receipts: [person('bob', 0, 0)], ...extra,
});
const login = () => auth.setState({ session: { token: 'session-' + Math.random(), user: { id: 'alice' } } });
const settle = () => new Promise(r => setImmediate(r));
// Records every request. `/delivered` answers like the backend; anything else is the test's job.
function network(answer = async () => { throw new Error('Unexpected request'); }) {
  const calls = [];
  request = async (path, options = {}) => {
    calls.push([options.method ?? 'GET', path, options.body]);
    return path.endsWith('/delivered') ? { conversationId: 'chat', deliveredSequence: options.body.sequence } : answer(path, options);
  };
  return { calls, reports: () => calls.filter(call => call[1].endsWith('/delivered')).map(call => call[2].sequence) };
}

test('a private chat ticks sent, then delivered, then read', () => {
  const mine = message(5, 'alice');
  assert.equal(messageStatus(mine, [person('bob', 4, 4)]), 'sent');
  assert.equal(messageStatus(mine, [person('bob', 5, 4)]), 'delivered');
  assert.equal(messageStatus(mine, [person('bob', 9, 5)]), 'read');
  // A backend without receipts, or a chat with nobody else in it, stays on one tick.
  assert.equal(messageStatus(mine, undefined), 'sent');
  assert.equal(messageStatus(mine, []), 'sent');
});

test('in a household chat the slowest person decides the ticks', () => {
  const mine = message(5, 'alice');
  assert.equal(messageStatus(mine, [person('bob', 5, 5), person('asha', 5, 5)]), 'read');
  assert.equal(messageStatus(mine, [person('bob', 5, 5), person('asha', 5, 2)]), 'delivered');
  assert.equal(messageStatus(mine, [person('bob', 5, 5), person('asha', 3, 2)]), 'sent');
});

test('someone who joined later does not hold old messages back, but counts once they catch up', () => {
  const mine = message(5, 'alice');
  const late = '2026-09-21T00:00:00Z'; // the day after the message
  assert.equal(messageStatus(mine, [person('bob', 5, 5), person('ravi', 0, 0, late)]), 'read');
  assert.equal(messageStatus(mine, [person('bob', 5, 5), person('ravi', 5, 0, late)]), 'delivered');
  assert.equal(messageStatus(mine, [person('bob', 5, 5), person('ravi', 7, 7, late)]), 'read');
  // If only late joiners are left, there is nobody to report on yet.
  assert.equal(messageStatus(mine, [person('ravi', 0, 0, late)]), 'sent');
});

test('progress only moves forward, and an unchanged list keeps its identity', () => {
  const receipts = [person('bob', 5, 3), person('asha', 2, 2)];
  const event = extra => ({ conversationId: 'chat', userId: 'bob', deliveredSequence: 0, readSequence: 0, ...extra });
  assert.equal(applyReceipt(receipts, event({ deliveredSequence: 5, readSequence: 3 })), receipts); // a repeat
  assert.equal(applyReceipt(receipts, event({ deliveredSequence: 4, readSequence: 1 })), receipts); // late and out of order
  assert.equal(applyReceipt(receipts, event({ userId: 'stranger', deliveredSequence: 9, readSequence: 9 })), receipts);
  assert.equal(applyReceipt(undefined, event({ deliveredSequence: 9 })), undefined);
  const moved = applyReceipt(receipts, event({ deliveredSequence: 8, readSequence: 1 }));
  assert.deepEqual(moved, [person('bob', 8, 3), person('asha', 2, 2)]); // read stays at 3, never back to 1
  assert.equal(receipts[0].deliveredSequence, 5); // the original is not mutated
});

test('an older summary cannot take back progress already heard over the socket', () => {
  const known = [person('bob', 8, 8), person('gone', 4, 4)];
  const summary = [person('bob', 5, 5), person('ravi', 1, 0)];
  // The summary decides who is listed: "gone" has left and "ravi" is new. Bob keeps 8.
  assert.deepEqual(mergeReceipts(known, summary), [person('bob', 8, 8), person('ravi', 1, 0)]);
  assert.equal(mergeReceipts(undefined, summary), summary);
  assert.equal(mergeReceipts(known, undefined), undefined);
});

test('message info lines show a time only when there is an honest one', () => {
  const now = Date.parse('2026-09-22T15:00:00');
  const who = extra => ({ user: { id: 'bob', name: 'Bob' }, delivered: false, read: false, deliveredAt: null, readAt: null, ...extra });
  assert.equal(receiptLine(who(), now), 'Not delivered yet');
  assert.equal(receiptLine(who({ delivered: true }), now), 'Delivered');
  assert.equal(receiptLine(who({ delivered: true, read: true }), now), 'Read'); // Clear chat, or read before times were kept
  const today = receiptLine(who({ delivered: true, read: true, readAt: '2026-09-22T10:02:00' }), now);
  assert.match(today, /^Read \d{1,2}:02/);
  assert.equal(today.includes(','), false); // today needs no date
  // Another day shows the date as well, so a bare time is never ambiguous.
  assert.match(receiptTime('2026-09-20T10:02:00', now), /.+, \d{1,2}:02/);
  assert.match(receiptLine(who({ delivered: true, deliveredAt: '2026-09-20T09:58:00' }), now), /^Delivered .+, \d{1,2}:58/);
});

test('payloads are checked before they reach the store', async () => {
  assert.equal(isConversation(conversation()), true);
  assert.equal(isConversation(conversation({ receipts: undefined })), true); // an older backend
  assert.equal(isConversation(conversation({ receipts: [{ userId: 'bob' }] })), false);
  assert.equal(isConversation(conversation({ receipts: [person('bob', -1, 0)] })), false);
  assert.equal(isReceiptEvent({ conversationId: 'chat', userId: 'bob', deliveredSequence: 5, readSequence: 4 }), true);
  for (const bad of [null, {}, { conversationId: 'chat', userId: 'bob', deliveredSequence: '5', readSequence: 4 }]) assert.equal(isReceiptEvent(bad), false);
  login();
  network(async () => ({ messageId: 'm-5', receipts: [{ user: { id: 'bob', name: 'Bob' }, delivered: true, read: 'yes', deliveredAt: null, readAt: null }] }));
  await assert.rejects(getMessageReceipts('t', 'chat', 'm-5'), /Could not read the chat response/);
});

test('a receipt event re-ticks the chat it belongs to and ignores the rest', () => {
  login();
  store.setState({ conversations: { chat: conversation() } });
  const before = store.getState().conversations;
  store.getState().receiveReceipt({ conversationId: 'elsewhere', userId: 'bob', deliveredSequence: 9, readSequence: 9 });
  store.getState().receiveReceipt({ conversationId: 'chat', userId: 'bob', deliveredSequence: 0, readSequence: 0 });
  assert.equal(store.getState().conversations, before); // nothing changed, so nothing re-renders
  store.getState().receiveReceipt({ conversationId: 'chat', userId: 'bob', deliveredSequence: 6, readSequence: 2 });
  assert.deepEqual(store.getState().conversations.chat.receipts, [person('bob', 6, 2)]);
});

test('a message from someone else is reported as delivered once, and never my own', async () => {
  login();
  const net = network();
  store.setState({ conversations: { chat: conversation() }, threads: {} });
  store.getState().receive(message(3, 'bob'));
  store.getState().receive(message(3, 'bob')); // the socket can repeat itself
  store.getState().receive(message(2, 'bob')); // out of order: 3 is already reported
  store.getState().receive(message(4, 'alice')); // my own message, echoed back
  await settle();
  assert.deepEqual(net.calls, [['PATCH', '/conversations/chat/delivered', { sequence: 3 }]]);
  store.getState().receive(message(5, 'bob'));
  await settle();
  assert.deepEqual(net.reports(), [3, 5]);
});

test('what I have already read is not reported again, and a failed report is retried', async () => {
  login();
  store.setState({ conversations: { chat: conversation({ lastReadSequence: 7 }) }, threads: {} });
  const net = network();
  store.getState().delivered('chat', 7); // reading already told the backend
  await settle();
  assert.deepEqual(net.reports(), []);
  let fail = true;
  const calls = [];
  request = async (path, options) => { calls.push(options.body.sequence); if (fail) throw new Error('offline'); return {}; };
  store.getState().delivered('chat', 8);
  await settle();
  fail = false;
  store.getState().delivered('chat', 8); // forgotten after the failure, so it goes out again
  await settle();
  store.getState().delivered('chat', 8); // and once it succeeded, not a third time
  await settle();
  assert.deepEqual(calls, [8, 8]);
});

test('opening a chat, or the chat list, reports what has now reached this phone', async () => {
  login();
  store.setState({ conversations: {}, threads: {}, lists: {} });
  let net = network(async path => path.endsWith('/chat') ? { conversation: conversation({ unreadCount: 2 }) }
    : { messages: [message(5), message(6)], latestSequence: 6, hasMore: false, nextBefore: null, nextAfter: null });
  await store.getState().sync('chat');
  await settle();
  assert.deepEqual(net.reports(), [6]); // everything up to the recovery cursor

  login(); // a new session, so nothing has been reported yet
  store.setState({ conversations: {}, threads: {}, lists: {} });
  const list = [
    conversation({ id: 'unread', latestMessage: { ...message(4), conversationId: 'unread' }, unreadCount: 1 }),
    conversation({ id: 'seen', latestMessage: { ...message(9), conversationId: 'seen' }, lastReadSequence: 9 }),
    conversation({ id: 'mine', latestMessage: { ...message(2, 'alice'), conversationId: 'mine' } }),
    conversation({ id: 'empty' }),
  ];
  net = network(async () => ({ conversations: list, pagination: { page: 1, limit: 100, total: 4, totalPages: 1 } }));
  await store.getState().loadList('home');
  await settle();
  // Only the chat with someone else's unread message needs a report.
  assert.deepEqual(net.calls.filter(call => call[0] === 'PATCH'), [['PATCH', '/conversations/unread/delivered', { sequence: 4 }]]);
});

test('signing out never reports anything', async () => {
  auth.setState({ session: null });
  const net = network();
  store.getState().delivered('chat', 5);
  await settle();
  assert.deepEqual(net.calls, []);
});
