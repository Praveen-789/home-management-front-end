import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addDays, compareTasks, daysUntil, dueDateToIso, formatDueDate, isOverdue, localDayAsUtc, matchesFilter, parseDateInput, toDateInput,
  utcDayAsLocal,
} from '../src/lib/task-helpers.ts';

const task = (id, dueDate, createdAt, status = 'TODO') => ({ id, dueDate, createdAt, status });

test('orders like the backend: due date ascending with undated last, then newest first, then id', () => {
  const soon = task('b', '2026-09-10T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
  const later = task('a', '2026-09-20T00:00:00.000Z', '2026-09-02T00:00:00.000Z');
  const undatedNew = task('d', null, '2026-09-05T00:00:00.000Z');
  const undatedOld = task('c', null, '2026-09-03T00:00:00.000Z');
  const tie1 = task('x', null, '2026-09-03T00:00:00.000Z');
  const tie2 = task('y', null, '2026-09-03T00:00:00.000Z');
  const sorted = [tie2, undatedOld, later, undatedNew, tie1, soon].sort(compareTasks).map((item) => item.id);
  assert.deepEqual(sorted, ['b', 'a', 'd', 'c', 'x', 'y']);
});

test('matches the ALL filter or an exact status', () => {
  assert.equal(matchesFilter({ status: 'DONE' }, 'ALL'), true);
  assert.equal(matchesFilter({ status: 'DONE' }, 'DONE'), true);
  assert.equal(matchesFilter({ status: 'TODO' }, 'DONE'), false);
});

test('overdue means the due day has passed and the task is not done', () => {
  const now = new Date(2026, 8, 8, 15, 30);
  const yesterday = dueDateToIso(new Date(2026, 8, 7));
  const today = dueDateToIso(new Date(2026, 8, 8));
  assert.equal(isOverdue({ status: 'TODO', dueDate: yesterday }, now), true);
  assert.equal(isOverdue({ status: 'IN_PROGRESS', dueDate: yesterday }, now), true);
  assert.equal(isOverdue({ status: 'DONE', dueDate: yesterday }, now), false);
  assert.equal(isOverdue({ status: 'TODO', dueDate: today }, now), false);
  assert.equal(isOverdue({ status: 'TODO', dueDate: null }, now), false);
});

test('counts whole days regardless of the time of day', () => {
  const now = new Date(2026, 8, 8, 23, 59);
  assert.equal(daysUntil(new Date(2026, 8, 9, 0, 1), now), 1);
  assert.equal(daysUntil(new Date(2026, 8, 8, 0, 0), now), 0);
  assert.equal(daysUntil(new Date(2026, 8, 1, 12, 0), now), -7);
});

test('formats near dates as words and others as a short date', () => {
  const now = new Date(2026, 8, 8, 9, 0);
  assert.equal(formatDueDate(dueDateToIso(new Date(2026, 8, 8)), now), 'Today');
  assert.equal(formatDueDate(dueDateToIso(new Date(2026, 8, 9)), now), 'Tomorrow');
  assert.equal(formatDueDate(dueDateToIso(new Date(2026, 8, 7)), now), 'Yesterday');
  const sameYear = formatDueDate(dueDateToIso(new Date(2026, 8, 20)), now);
  assert.match(sameYear, /20/);
  assert.doesNotMatch(sameYear, /2026/);
  assert.match(formatDueDate(dueDateToIso(new Date(2027, 0, 5)), now), /2027/);
});

test('parses YYYY-MM-DD, treats blank as no date, and rejects anything else', () => {
  assert.equal(parseDateInput(''), null);
  assert.equal(parseDateInput('   '), null);
  for (const text of ['tomorrow', '2026-9-8', '08-09-2026', '2026-13-01', '2026-02-30', '2026-00-10']) {
    assert.equal(parseDateInput(text), undefined, text);
  }
  const date = parseDateInput(' 2026-09-08 ');
  assert.deepEqual([date.getFullYear(), date.getMonth(), date.getDate()], [2026, 8, 8]);
});

test('round-trips between the form text, a Date, and the ISO string sent to the API', () => {
  const date = parseDateInput('2026-09-08');
  assert.equal(toDateInput(date), '2026-09-08');
  assert.equal(toDateInput(addDays(date, 7)), '2026-09-15');
  assert.equal(toDateInput(addDays(date, -8)), '2026-08-31');
  const iso = dueDateToIso(new Date(2026, 8, 8, 17, 45));
  assert.equal(toDateInput(new Date(iso)), '2026-09-08');
  assert.equal(new Date(iso).getHours(), 0);
});

test('carries the calendar day to and from the UTC days that the Android date picker uses', () => {
  const deviceZone = process.env.TZ;
  try {
    // One zone ahead of UTC and one behind it: a conversion that only suits India would fail New York.
    for (const zone of ['Asia/Kolkata', 'America/New_York', 'UTC']) {
      process.env.TZ = zone;
      assert.equal(localDayAsUtc(new Date(2026, 8, 22, 17, 45)).toISOString(), '2026-09-22T00:00:00.000Z', zone);
      const picked = utcDayAsLocal(new Date('2026-09-22T00:00:00.000Z'));
      assert.deepEqual([picked.getFullYear(), picked.getMonth(), picked.getDate(), picked.getHours()], [2026, 8, 22, 0], zone);
    }
  } finally {
    if (deviceZone === undefined) delete process.env.TZ;
    else process.env.TZ = deviceZone;
  }
});
