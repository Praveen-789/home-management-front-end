import assert from 'node:assert/strict';
import { test } from 'node:test';
import { typingLabel } from '../src/lib/chat-helpers.ts';
import { receiveTyping, reportTyping, resetTyping, setTypingReporter, stopTyping, TYPING_REPORT_EVERY, TYPING_SHOWN_FOR, useTyping } from '../src/lib/chat-typing.ts';

const typists = conversationId => Object.values(useTyping.getState().typing[conversationId] ?? {});

test('the typing line names one or two people, and says only "typing…" in a private chat', () => {
  assert.equal(typingLabel([], 'HOUSEHOLD'), null);
  assert.equal(typingLabel([], 'DIRECT'), null);
  assert.equal(typingLabel(['Bob'], 'DIRECT'), 'typing…');
  assert.equal(typingLabel(['Ravi'], 'HOUSEHOLD'), 'Ravi is typing…');
  assert.equal(typingLabel(['Ravi', 'Asha'], 'HOUSEHOLD'), 'Ravi and Asha are typing…');
  assert.equal(typingLabel(['Ravi', 'Asha', 'Bob'], 'HOUSEHOLD'), 'Several people are typing…');
});

test('a typing mark lasts while reports come, fades when they stop, and ends when the message arrives', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(resetTyping);
  receiveTyping('chat', 'ravi', 'Ravi');
  receiveTyping('chat', 'asha', 'Asha');
  receiveTyping('other', 'ravi', 'Ravi');
  t.mock.timers.tick(TYPING_SHOWN_FOR - 1000);
  // Ravi is still typing: his mark is renewed and keeps its place in the line.
  receiveTyping('chat', 'ravi', 'Ravi');
  assert.deepEqual(typists('chat'), ['Ravi', 'Asha']);
  t.mock.timers.tick(1000);
  assert.deepEqual(typists('chat'), ['Ravi']);
  assert.deepEqual(typists('other'), []);
  stopTyping('chat', 'ravi');
  assert.deepEqual(typists('chat'), []);
  // His old timer does not bring the mark back, and stopping someone who is not typing changes nothing.
  t.mock.timers.tick(TYPING_SHOWN_FOR);
  assert.deepEqual(typists('chat'), []);
  const before = useTyping.getState();
  stopTyping('chat', 'nobody');
  assert.equal(useTyping.getState(), before);
});

test('keystrokes report at most once per chat every few seconds, and only while signed in', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  t.after(resetTyping);
  const sent = [];
  reportTyping('chat'); // the socket has not been set up yet
  setTypingReporter(conversationId => sent.push(conversationId));
  reportTyping('chat'); reportTyping('chat'); reportTyping('other');
  assert.deepEqual(sent, ['chat', 'other']);
  t.mock.timers.tick(TYPING_REPORT_EVERY - 1);
  reportTyping('chat');
  assert.deepEqual(sent, ['chat', 'other']);
  t.mock.timers.tick(1);
  reportTyping('chat');
  assert.deepEqual(sent, ['chat', 'other', 'chat']);
  // Signing out forgets the socket.
  resetTyping();
  t.mock.timers.tick(TYPING_REPORT_EVERY);
  reportTyping('other');
  assert.equal(sent.length, 3);
});
