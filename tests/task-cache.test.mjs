import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyTask, forgetTask, storeTaskPage } from '../src/lib/task-helpers.ts';

// These are the pure functions the Redux reducers call, exercised the same way Immer will call them.
const user = { id: 'u1', name: 'Praveen', email: 'p@example.com' };
const task = (id, overrides = {}) => ({
  id, householdId: 'home', title: id, description: null, status: 'TODO', priority: 'MEDIUM', dueDate: null,
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', createdBy: user, assignedTo: null, ...overrides,
});
const page = (tasks, pagination = {}) => ({ tasks, pagination: { page: 1, limit: 20, total: tasks.length, totalPages: 1, ...pagination } });
const cache = () => ({ tasksById: {}, listsByHousehold: {} });
const ids = (cache) => cache.listsByHousehold.home.tasks.map((item) => item.id);

test('page 1 replaces the list and remembers every task by id', () => {
  const state = cache();
  storeTaskPage(state, 'home', 'ALL', 1, page([task('a'), task('b')]));
  storeTaskPage(state, 'home', 'ALL', 1, page([task('c')]));
  assert.deepEqual(ids(state), ['c']);
  assert.deepEqual(Object.keys(state.tasksById).sort(), ['a', 'b', 'c']);
  assert.equal(state.listsByHousehold.home.filter, 'ALL');
});

test('a later page of the same filter appends without repeating rows', () => {
  const state = cache();
  storeTaskPage(state, 'home', 'ALL', 1, page([task('a'), task('b')], { total: 3, totalPages: 2 }));
  storeTaskPage(state, 'home', 'ALL', 2, page([task('b'), task('c')], { page: 2, total: 3, totalPages: 2 }));
  assert.deepEqual(ids(state), ['a', 'b', 'c']);
  assert.equal(state.listsByHousehold.home.pagination.page, 2);
});

test('a page for a different filter starts a fresh list', () => {
  const state = cache();
  storeTaskPage(state, 'home', 'ALL', 1, page([task('a'), task('b')]));
  storeTaskPage(state, 'home', 'DONE', 2, page([task('z', { status: 'DONE' })], { page: 2 }));
  assert.deepEqual(ids(state), ['z']);
  assert.equal(state.listsByHousehold.home.filter, 'DONE');
});

test('a created task is inserted in order and counted when it matches the filter', () => {
  const state = cache();
  storeTaskPage(state, 'home', 'ALL', 1, page([task('a', { dueDate: '2026-09-20T00:00:00.000Z' }), task('b')]));
  applyTask(state, 'home', task('c', { dueDate: '2026-09-10T00:00:00.000Z' }), true);
  assert.deepEqual(ids(state), ['c', 'a', 'b']);
  assert.equal(state.listsByHousehold.home.pagination.total, 3);
});

test('a created task that does not match the filter is remembered but not listed', () => {
  const state = cache();
  storeTaskPage(state, 'home', 'DONE', 1, page([task('a', { status: 'DONE' })]));
  applyTask(state, 'home', task('b'), true);
  assert.deepEqual(ids(state), ['a']);
  assert.equal(state.listsByHousehold.home.pagination.total, 1);
  assert.equal(state.tasksById.b.id, 'b');
});

test('an updated task is replaced in place, or dropped when it leaves the filter', () => {
  const state = cache();
  storeTaskPage(state, 'home', 'TODO', 1, page([task('a'), task('b')]));
  applyTask(state, 'home', task('a', { title: 'Renamed' }));
  assert.equal(state.listsByHousehold.home.tasks.find((item) => item.id === 'a').title, 'Renamed');
  assert.equal(state.listsByHousehold.home.pagination.total, 2);
  applyTask(state, 'home', task('a', { status: 'DONE' }));
  assert.deepEqual(ids(state), ['b']);
  assert.equal(state.listsByHousehold.home.pagination.total, 1);
  assert.equal(state.tasksById.a.status, 'DONE');
});

test('an updated task not in the list only updates the id map', () => {
  const state = cache();
  storeTaskPage(state, 'home', 'ALL', 1, page([task('a')], { total: 30, totalPages: 2 }));
  applyTask(state, 'home', task('far-away'));
  assert.deepEqual(ids(state), ['a']);
  assert.equal(state.listsByHousehold.home.pagination.total, 30);
  assert.equal(state.tasksById['far-away'].id, 'far-away');
});

test('applying a task with no list loaded only fills the id map', () => {
  const state = cache();
  applyTask(state, 'home', task('a'));
  assert.deepEqual(state.listsByHousehold, {});
  assert.equal(state.tasksById.a.id, 'a');
});

test('forgetting a task removes it everywhere and lowers the total, never below zero', () => {
  const state = cache();
  storeTaskPage(state, 'home', 'ALL', 1, page([task('a')]));
  forgetTask(state, 'home', 'a');
  assert.deepEqual(ids(state), []);
  assert.deepEqual(state.listsByHousehold.home.pagination, { page: 1, limit: 20, total: 0, totalPages: 0 });
  assert.equal(state.tasksById.a, undefined);
  forgetTask(state, 'home', 'a');
  assert.equal(state.listsByHousehold.home.pagination.total, 0);
});
