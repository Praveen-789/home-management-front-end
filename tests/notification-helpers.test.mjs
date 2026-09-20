import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyRead, applyReadAll, forgetNotification, formatWhen, notificationIcon, notificationTarget, NOTIFICATION_TYPES, storeNotificationPage,
  unreadLabel,
} from '../src/lib/notification-helpers.ts';

const notice = (id, isRead = false) => ({
  id, type: 'TASK_ASSIGNED', title: 'New task assigned to you', message: 'You were assigned the task: Buy groceries',
  isRead, householdId: 'home', entityId: 'task-1', createdAt: '2026-09-20T10:00:00.000Z',
});
const pagination = (total, page = 1, limit = 2) => ({ page, limit, total, totalPages: Math.ceil(total / limit) });
const inbox = (filter, notifications, unreadCount, total = notifications.length) =>
  ({ list: { filter, notifications, pagination: pagination(total) }, unreadCount });

test('every known type has its own icon and an unknown type falls back to the bell', () => {
  const icons = NOTIFICATION_TYPES.map(notificationIcon);
  assert.equal(new Set(icons).size, NOTIFICATION_TYPES.length);
  assert.ok(!icons.includes('bell-outline'));
  assert.equal(notificationIcon('SOMETHING_NEW'), 'bell-outline');
});

test('targets follow the type: task, expense, or the household alone', () => {
  const base = { householdId: 'home', entityId: 'id-1' };
  for (const type of ['TASK_ASSIGNED', 'TASK_COMPLETED']) {
    assert.deepEqual(notificationTarget({ ...base, type }), { kind: 'task', householdId: 'home', taskId: 'id-1' });
  }
  for (const type of ['EXPENSE_ADDED', 'EXPENSE_UPDATED']) {
    assert.deepEqual(notificationTarget({ ...base, type }), { kind: 'expense', householdId: 'home', expenseId: 'id-1' });
  }
  for (const type of ['MEMBER_JOINED', 'INVITATION_DECLINED']) {
    assert.deepEqual(notificationTarget({ type, householdId: 'home', entityId: null }), { kind: 'household', householdId: 'home' });
  }
});

test('an invitation asks for an answer instead of opening a household the user has not joined', () => {
  assert.deepEqual(notificationTarget({ type: 'HOUSEHOLD_INVITATION', householdId: 'home', entityId: 'inv-1' }), { kind: 'invitation', householdId: 'home', invitationId: 'inv-1' });
  assert.equal(notificationTarget({ type: 'HOUSEHOLD_INVITATION', householdId: 'home', entityId: null }), null);
  assert.equal(notificationTarget({ type: 'HOUSEHOLD_INVITATION', householdId: null, entityId: 'inv-1' }), null);
});

test('a notification with missing IDs or an unknown type has no target', () => {
  assert.equal(notificationTarget({ type: 'TASK_ASSIGNED', householdId: null, entityId: 'task-1' }), null);
  assert.equal(notificationTarget({ type: 'TASK_ASSIGNED', householdId: 'home', entityId: null }), null);
  assert.equal(notificationTarget({ type: 'EXPENSE_ADDED', householdId: 'home', entityId: null }), null);
  assert.equal(notificationTarget({ type: 'MEMBER_JOINED', householdId: null, entityId: null }), null);
  assert.equal(notificationTarget({ type: 'MEMBER_REMOVED', householdId: 'home', entityId: null }), null);
  assert.equal(notificationTarget({ type: 'SOMETHING_NEW', householdId: 'home', entityId: 'x' }), null);
});

test('formats arrival times relative to now', () => {
  const now = new Date('2026-09-20T12:00:00.000Z');
  const ago = (minutes) => new Date(now.getTime() - minutes * 60000).toISOString();
  assert.equal(formatWhen(ago(0), now), 'Just now');
  assert.equal(formatWhen(ago(-5), now), 'Just now'); // a device clock running behind the server
  assert.equal(formatWhen(ago(1), now), '1 min ago');
  assert.equal(formatWhen(ago(59), now), '59 min ago');
  assert.equal(formatWhen(ago(60), now), '1 hr ago');
  assert.equal(formatWhen(ago(23 * 60 + 59), now), '23 hr ago');
  assert.equal(formatWhen(ago(24 * 60), now), 'Yesterday');
  assert.notEqual(formatWhen(ago(48 * 60), now), 'Yesterday');
});

test('page 1 replaces the list, a later page appends without repeating rows', () => {
  const first = storeNotificationPage({ list: null, unreadCount: 4 }, 'all', 1, { notifications: [notice('a'), notice('b')], pagination: pagination(4) });
  assert.deepEqual(first.list.notifications.map((n) => n.id), ['a', 'b']);
  assert.equal(first.unreadCount, 4);

  // A new notification shifted the list, so page 2 repeats "b".
  const second = storeNotificationPage(first, 'all', 2, { notifications: [notice('b'), notice('c')], pagination: pagination(5, 2) });
  assert.deepEqual(second.list.notifications.map((n) => n.id), ['a', 'b', 'c']);
  assert.equal(second.list.pagination.page, 2);

  const reloaded = storeNotificationPage(second, 'all', 1, { notifications: [notice('z')], pagination: pagination(1) });
  assert.deepEqual(reloaded.list.notifications.map((n) => n.id), ['z']);
});

test('a page for the other filter replaces the list, and an unread page sets the count', () => {
  const all = inbox('all', [notice('a'), notice('b', true)], 9);
  const unread = storeNotificationPage(all, 'unread', 2, { notifications: [notice('a')], pagination: pagination(1) });
  assert.deepEqual(unread.list.notifications.map((n) => n.id), ['a']);
  assert.equal(unread.list.filter, 'unread');
  assert.equal(unread.unreadCount, 1);
});

test('marking read flags the row in the full list and removes it from the unread list', () => {
  const all = applyRead(inbox('all', [notice('a'), notice('b')], 2), 'a');
  assert.deepEqual(all.list.notifications.map((n) => n.isRead), [true, false]);
  assert.equal(all.list.pagination.total, 2);
  assert.equal(all.unreadCount, 1);

  const unread = applyRead(inbox('unread', [notice('a'), notice('b')], 2), 'a');
  assert.deepEqual(unread.list.notifications.map((n) => n.id), ['b']);
  assert.equal(unread.list.pagination.total, 1);
  assert.equal(unread.unreadCount, 1);
});

test('marking read is a no-op for a read, unknown or unloaded notification', () => {
  const state = inbox('all', [notice('a', true)], 3);
  assert.equal(applyRead(state, 'a'), state);
  assert.equal(applyRead(state, 'missing'), state);
  const empty = { list: null, unreadCount: 3 };
  assert.equal(applyRead(empty, 'a'), empty);
});

test('mark all read clears the count, flags the full list and empties the unread list', () => {
  const all = applyReadAll(inbox('all', [notice('a'), notice('b', true)], 5));
  assert.ok(all.list.notifications.every((n) => n.isRead));
  assert.equal(all.unreadCount, 0);

  const unread = applyReadAll(inbox('unread', [notice('a'), notice('b')], 5, 5));
  assert.deepEqual(unread.list.notifications, []);
  assert.deepEqual(unread.list.pagination, { page: 1, limit: 2, total: 0, totalPages: 0 });

  assert.deepEqual(applyReadAll({ list: null, unreadCount: 5 }), { list: null, unreadCount: 0 });
});

test('deleting removes the row and lowers the count only for an unread one', () => {
  const state = inbox('all', [notice('a'), notice('b', true)], 1, 3);
  const withoutUnread = forgetNotification(state, 'a');
  assert.deepEqual(withoutUnread.list.notifications.map((n) => n.id), ['b']);
  assert.equal(withoutUnread.list.pagination.total, 2);
  assert.equal(withoutUnread.list.pagination.totalPages, 1);
  assert.equal(withoutUnread.unreadCount, 0);

  const withoutRead = forgetNotification(state, 'b');
  assert.equal(withoutRead.unreadCount, 1);
  assert.equal(forgetNotification(state, 'missing'), state);
});

test('counts never go below zero and the given inbox is left untouched', () => {
  const state = inbox('all', [notice('a')], 0, 0);
  const frozen = structuredClone(state);
  assert.equal(applyRead(state, 'a').unreadCount, 0);
  assert.equal(forgetNotification(state, 'a').list.pagination.total, 0);
  applyReadAll(state);
  assert.deepEqual(state, frozen);
});

test('a badge shows the exact unread count up to 99, then 99+', () => {
  assert.equal(unreadLabel(1), '1');
  assert.equal(unreadLabel(99), '99');
  assert.equal(unreadLabel(100), '99+');
});
