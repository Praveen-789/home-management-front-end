import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { isPresenceEvent, presenceBoundary, presenceLabel, receivePresence, receivePresenceSnapshot, resetPresence, usePresence } from '../src/lib/chat-presence.ts';
afterEach(resetPresence);
const person = { id: 'bob', name: 'Bob', isOnline: false, lastSeenAt: null };
const event = (isOnline, time) => ({ userId: 'bob', isOnline, lastSeenAt: isOnline ? null : time, updatedAt: time });
test('invalid presence payloads are ignored', () => {
  assert.equal(isPresenceEvent(event(true, '2026-10-01T10:00:00Z')), true);
  for (const value of [null, {}, { ...event(true, 'bad') }, { ...event(true, '2026-10-01T10:00:00Z'), isOnline: 'yes' }]) assert.equal(isPresenceEvent(value), false);
});
test('new live events win over in-flight snapshots and older events', () => {
  const start = presenceBoundary();
  receivePresence(event(true, '2026-10-01T10:01:00Z'));
  receivePresenceSnapshot([person], start);
  receivePresence(event(false, '2026-10-01T10:00:00Z'));
  assert.equal(usePresence.getState().users.bob.isOnline, true);
  receivePresenceSnapshot([person], presenceBoundary());
  assert.equal(usePresence.getState().users.bob.isOnline, false);
});
test('disconnect rejects old snapshots and hides stale online labels', () => {
  const start = presenceBoundary();
  resetPresence();
  receivePresenceSnapshot([person], start);
  assert.deepEqual(usePresence.getState().users, {});
  const direct = { type: 'DIRECT', participants: [person] };
  assert.equal(presenceLabel(direct, 'alice', { bob: { isOnline: true, lastSeenAt: null } }, false), null);
});
test('labels count other online members and handle unknown last seen', () => {
  const direct = { type: 'DIRECT', participants: [person] };
  assert.equal(presenceLabel(direct, 'alice', { bob: { isOnline: true, lastSeenAt: null } }, true), 'Online');
  assert.equal(presenceLabel(direct, 'alice', { bob: { isOnline: false, lastSeenAt: null } }, true), null);
  assert.match(presenceLabel(direct, 'alice', { bob: { isOnline: false, lastSeenAt: '2026-10-01T10:00:00Z' } }, true), /^Last seen /);
  assert.equal(presenceLabel({ type: 'HOUSEHOLD', participants: [person, { id: 'alice' }] }, 'alice', { alice: { isOnline: true }, bob: { isOnline: true } }, true), '1 online');
});
