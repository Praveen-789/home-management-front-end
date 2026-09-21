import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as helpers from '../src/lib/chat-helpers.ts';

const me = { token: 'session-token', user: { id: 'me', name: 'Me', email: 'me@example.com' } };
const chatData = (extra = {}) => ({ type: 'CHAT_MESSAGE', conversationId: 'chat-1', messageId: 'm-5', sequence: 5, recipientId: 'me', ...extra });
const alert = (identifier, data) => ({ request: { identifier, content: { data } } });
// What a running app receives: Expo has already parsed the payload into `content.data`.
const press = (actionIdentifier, extra = {}, data = chatData()) => ({ actionIdentifier, notification: alert('0:1726900000%abc', data), ...extra });
// What the background task receives on Android: the same payload, still a JSON string.
const rawPress = (actionIdentifier, extra = {}, data = chatData()) => ({
  actionIdentifier, notification: { request: { identifier: '0:1726900000%abc', content: { title: 'Bob', dataString: JSON.stringify(data) } } }, ...extra,
});

function fixture({ session = me, expiresIn = 60_000, failSend = false, failRead = false, presented = [], sendGate } = {}) {
  const calls = [];
  const deps = {
    'expo-notifications': {
      setNotificationCategoryAsync: async (id, actions) => { calls.push(['category', id, actions]); },
      getPresentedNotificationsAsync: async () => presented,
      dismissNotificationAsync: async id => { calls.push(['dismiss', id]); },
      scheduleNotificationAsync: async request => { calls.push(['notice', request]); },
    },
    'expo-secure-store': { getItemAsync: async key => { calls.push(['storage', key]); return session ? JSON.stringify(session) : null; } },
    '@/api/auth': { isSession: value => !!value?.token && !!value?.user?.id, SESSION_STORAGE_KEY: 'homehub-session' },
    '@/api/chat': {
      isRecord: v => !!v && typeof v === 'object',
      sendMessage: async (token, id, clientMessageId, text) => {
        calls.push(['send', token, id, clientMessageId, text]);
        if (sendGate) await sendGate;
        if (failSend) throw new Error('offline');
        return { sequence: 9 };
      },
      markRead: async (token, id, sequence) => { calls.push(['read', token, id, sequence]); if (failRead) throw new Error('offline'); return {}; },
    },
    '@/api/token': { tokenExpiresAt: () => Date.now() + expiresIn },
    '@/lib/chat-helpers': helpers,
    '@/lib/chat-notification-cleanup': { clearReadChatNotifications: async () => {} },
  };
  const source = readFileSync(new URL('../src/lib/chat-notification-actions.ts', import.meta.url), 'utf8');
  const js = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
  const exports = {};
  new Function('require', 'exports', js)(name => { if (!(name in deps)) throw new Error('Unmocked: ' + name); return deps[name]; }, exports);
  return { ...exports, calls, of: kind => calls.filter(c => c[0] === kind) };
}

test('the category offers an inline Reply and a Mark as read, and neither opens the app', async () => {
  const f = fixture();
  await f.registerChatCategory();
  const [, id, actions] = f.calls[0];
  assert.match(id, /^[A-Za-z0-9_]+$/); // Expo rejects ":" and "-" in a category name.
  assert.equal(id, 'chat_message');    // Must match the categoryId the backend sends.
  assert.deepEqual(actions.map(a => a.identifier), ['reply', 'mark_read']);
  assert.ok(actions[0].textInput);
  assert.ok(actions.every(a => a.options.opensAppToForeground === false));
});

test('a press is read the same way from a running app and from the raw background payload', () => {
  const f = fixture();
  const expected = { kind: 'reply', notificationId: '0:1726900000%abc', conversationId: 'chat-1', recipientId: 'me', sequence: 5, text: 'On my way' };
  assert.deepEqual(f.parseChatAction(press('reply', { userText: '  On my way ' })), expected);
  assert.deepEqual(f.parseChatAction(rawPress('reply', { userText: 'On my way' })), expected);
  assert.deepEqual(f.parseChatAction(rawPress('mark_read')), { ...expected, kind: 'read', text: '' });
});

test('anything that is not a complete chat button press is ignored', () => {
  const f = fixture();
  const ignored = [
    null, 'reply', {},
    press('expo.modules.notifications.actions.DEFAULT'),          // an ordinary tap
    { notification: null, data: { dataString: '{}' } },           // a push arriving, which the task also sees
    press('reply', { userText: '   ' }), press('reply'),           // nothing typed
    press('reply', { userText: 'Hi' }, chatData({ type: 'TASK_ASSIGNED' })),
    press('reply', { userText: 'Hi' }, chatData({ recipientId: undefined })),
    press('mark_read', {}, chatData({ sequence: '5' })), press('mark_read', {}, chatData({ sequence: 0 })),
    { actionIdentifier: 'reply', userText: 'Hi', notification: { request: { identifier: 'n', content: { dataString: '{broken' } } } },
  ];
  for (const value of ignored) assert.equal(f.parseChatAction(value), null);
});

test('a reply ID is stable for one press, differs between presses, and is always valid for the backend', () => {
  const f = fixture();
  assert.equal(f.replyMessageId('0:17%ab', 'Hi'), f.replyMessageId('0:17%ab', 'Hi'));
  assert.notEqual(f.replyMessageId('0:17%ab', 'Hi'), f.replyMessageId('0:17%ab', 'Hi!'));
  assert.notEqual(f.replyMessageId('0:17%ab', 'Hi'), f.replyMessageId('0:18%ab', 'Hi'));
  for (const id of ['0:17%ab', '', '%%%', 'x'.repeat(500)]) assert.match(f.replyMessageId(id, 'Hi 😀'), /^[A-Za-z0-9_-]{8,128}$/);
});

test('a reply is sent as the saved user, marks the chat read and clears that chat\'s read alerts', async () => {
  const f = fixture({ presented: [
    alert('older', chatData({ sequence: 4 })), alert('0:1726900000%abc', chatData()),
    alert('newer', chatData({ sequence: 10 })), alert('other-chat', chatData({ conversationId: 'chat-2', sequence: 1 })),
    alert('task', { type: 'TASK_ASSIGNED' }),
  ] });
  await f.handleChatAction(rawPress('reply', { userText: 'On my way' }));
  assert.deepEqual(f.of('storage'), [['storage', 'homehub-session']]);
  assert.deepEqual(f.of('send'), [['send', 'session-token', 'chat-1', f.replyMessageId('0:1726900000%abc', 'On my way'), 'On my way']]);
  // The reply is message 9, so reading up to it covers everything it answers.
  assert.deepEqual(f.of('read'), [['read', 'session-token', 'chat-1', 9]]);
  assert.deepEqual(f.of('dismiss').map(c => c[1]).sort(), ['0:1726900000%abc', 'older', 'reply_failed_chat-1'].sort());
  assert.equal(f.of('notice').length, 0);
});

test('Mark as read moves the cursor to the alerted message and sends nothing', async () => {
  const f = fixture();
  await f.handleChatAction(press('mark_read'));
  assert.equal(f.of('send').length, 0);
  assert.deepEqual(f.of('read'), [['read', 'session-token', 'chat-1', 5]]);
  assert.ok(f.of('dismiss').some(c => c[1] === '0:1726900000%abc'));
});

test('a failed Mark as read keeps the alert so it can be pressed again', async () => {
  const f = fixture({ failRead: true });
  await f.handleChatAction(press('mark_read'));
  assert.equal(f.of('dismiss').length, 0);
  await f.handleChatAction(press('mark_read'));
  assert.equal(f.of('read').length, 2);
});

test('a reply that cannot be sent becomes one "Reply not sent" notice that opens the chat', async () => {
  const f = fixture({ failSend: true });
  await f.handleChatAction(press('reply', { userText: 'On my way' }));
  assert.equal(f.of('read').length, 0);
  // The pressed alert is removed, otherwise Android leaves its spinner running forever.
  assert.deepEqual(f.of('dismiss'), [['dismiss', '0:1726900000%abc']]);
  const [[, notice]] = f.of('notice');
  assert.equal(notice.identifier, 'reply_failed_chat-1');
  assert.match(notice.content.body, /On my way/);
  assert.deepEqual(notice.trigger, { channelId: 'chat' });
  assert.equal(helpers.replyFailureTarget(notice.content.data), 'chat-1');
  assert.equal(helpers.chatNotificationTarget(notice.content.data), null); // not treated as a new message
});

test('nothing is sent when signed out, expired, or the alert was for another account', async () => {
  for (const options of [{ session: null }, { expiresIn: -1 }, { session: { ...me, user: { ...me.user, id: 'someone-else' } } }]) {
    const f = fixture(options);
    await f.handleChatAction(press('reply', { userText: 'Hi' }));
    await f.handleChatAction(press('mark_read'));
    assert.equal(f.of('send').length + f.of('read').length, 0);
    assert.equal(f.of('notice').length, 1); // the reply is reported, the Mark as read is simply dropped
  }
});

test('one press delivered twice at once is handled once, and other payloads never throw', async () => {
  let release;
  const f = fixture({ sendGate: new Promise(r => { release = r; }) });
  const first = f.handleChatAction(press('reply', { userText: 'Hi' }));
  const second = f.handleChatAction(rawPress('reply', { userText: 'Hi' }));
  await new Promise(r => setImmediate(r));
  release();
  await Promise.all([first, second, f.handleChatAction(null), f.handleChatAction({ notification: null })]);
  assert.equal(f.of('send').length, 1);
});
