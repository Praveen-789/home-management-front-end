import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyExpense, compareExpenses, CURRENCY_SYMBOL, forgetExpense, formatAmount, matchesFilter, parseAmountInput, sameFilter, storeExpensePage,
} from '../src/lib/expense-helpers.ts';

test('formats two-place amounts with thousands separators and the currency symbol', () => {
  assert.equal(formatAmount('1250.50'), `${CURRENCY_SYMBOL}1,250.50`);
  assert.equal(formatAmount('0.05'), `${CURRENCY_SYMBOL}0.05`);
  assert.equal(formatAmount('999.00'), `${CURRENCY_SYMBOL}999.00`);
  assert.equal(formatAmount('1234567.89'), `${CURRENCY_SYMBOL}1,234,567.89`);
  assert.equal(formatAmount('9999999999.99'), `${CURRENCY_SYMBOL}9,999,999,999.99`);
  // Defensive: a bare integer or one-place string still renders as money.
  assert.equal(formatAmount('7'), `${CURRENCY_SYMBOL}7.00`);
  assert.equal(formatAmount('7.5'), `${CURRENCY_SYMBOL}7.50`);
});

test('parses typed amounts into the two-place string the API expects', () => {
  const cases = [
    ['1250', '1250.00'], ['1250.5', '1250.50'], ['1,250.50', '1250.50'], [' 12 ', '12.00'], ['0012.30', '12.30'],
    ['.5', '0.50'], ['5.', '5.00'], ['0.01', '0.01'], ['9999999999.99', '9999999999.99'],
  ];
  for (const [text, expected] of cases) assert.equal(parseAmountInput(text), expected, text);
});

test('rejects amounts the backend would refuse', () => {
  for (const text of ['', '   ', 'abc', '-1', '0', '0.00', '1.005', '12.345', '12345678901', '1e3', '₹50', '10-20', '.']) {
    assert.equal(parseAmountInput(text), undefined, JSON.stringify(text));
  }
});

const expense = (id, createdAt, overrides = {}) => ({ id, createdAt, category: 'OTHER', task: null, ...overrides });

test('orders like the backend: newest first, then id', () => {
  const older = expense('b', '2026-09-01T00:00:00.000Z');
  const newer = expense('a', '2026-09-05T00:00:00.000Z');
  const tie1 = expense('x', '2026-09-03T00:00:00.000Z');
  const tie2 = expense('y', '2026-09-03T00:00:00.000Z');
  assert.deepEqual([tie2, older, newer, tie1].sort(compareExpenses).map((item) => item.id), ['a', 'x', 'y', 'b']);
});

test('filters by category and task independently', () => {
  const groceries = expense('g', '2026-09-01T00:00:00.000Z', { category: 'GROCERIES', task: { id: 't1' } });
  assert.equal(matchesFilter(groceries, {}), true);
  assert.equal(matchesFilter(groceries, { category: 'GROCERIES' }), true);
  assert.equal(matchesFilter(groceries, { category: 'RENT' }), false);
  assert.equal(matchesFilter(groceries, { taskId: 't1' }), true);
  assert.equal(matchesFilter(groceries, { taskId: 't2' }), false);
  assert.equal(matchesFilter(groceries, { category: 'GROCERIES', taskId: 't2' }), false);
  assert.equal(matchesFilter(expense('n', '2026-09-01T00:00:00.000Z'), { taskId: 't1' }), false);
  assert.equal(sameFilter({}, {}), true);
  assert.equal(sameFilter({ category: 'RENT' }, { category: 'RENT' }), true);
  assert.equal(sameFilter({ category: 'RENT' }, {}), false);
  assert.equal(sameFilter({ taskId: 't1' }, { taskId: 't2' }), false);
});

// ---- Cache rules behind the Zustand store ----
const user = { id: 'u1', name: 'Praveen', email: 'p@example.com' };
const full = (id, overrides = {}) => ({
  id, householdId: 'home', amount: '10.00', description: null, category: 'OTHER', createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z', paidBy: user, createdBy: user, task: null, ...overrides,
});
const page = (expenses, pagination = {}) => ({ expenses, pagination: { page: 1, limit: 20, total: expenses.length, totalPages: 1, ...pagination } });
const cache = () => ({ expensesById: {}, listsByHousehold: {} });
const ids = (state) => state.listsByHousehold.home.expenses.map((item) => item.id);

test('page 1 replaces the list, remembers every expense by id, and leaves the old cache untouched', () => {
  const first = storeExpensePage(cache(), 'home', {}, 1, page([full('a'), full('b')]));
  const second = storeExpensePage(first, 'home', {}, 1, page([full('c')]));
  assert.deepEqual(ids(second), ['c']);
  assert.deepEqual(Object.keys(second.expensesById).sort(), ['a', 'b', 'c']);
  assert.deepEqual(ids(first), ['a', 'b'], 'the previous cache is not mutated');
  assert.deepEqual(Object.keys(first.expensesById).sort(), ['a', 'b']);
});

test('a later page of the same filter appends without repeating rows', () => {
  const first = storeExpensePage(cache(), 'home', { category: 'RENT' }, 1, page([full('a'), full('b')], { total: 3, totalPages: 2 }));
  const second = storeExpensePage(first, 'home', { category: 'RENT' }, 2, page([full('b'), full('c')], { page: 2, total: 3, totalPages: 2 }));
  assert.deepEqual(ids(second), ['a', 'b', 'c']);
  assert.equal(second.listsByHousehold.home.pagination.page, 2);
});

test('a page for a different filter starts a fresh list', () => {
  const first = storeExpensePage(cache(), 'home', {}, 1, page([full('a'), full('b')]));
  const second = storeExpensePage(first, 'home', { taskId: 't1' }, 2, page([full('z', { task: { id: 't1', title: 'Chore', status: 'DONE' } })], { page: 2 }));
  assert.deepEqual(ids(second), ['z']);
  assert.deepEqual(second.listsByHousehold.home.filter, { taskId: 't1' });
});

test('a created expense is inserted newest-first and counted when it matches the filter', () => {
  const state = storeExpensePage(cache(), 'home', {}, 1, page([full('a', { createdAt: '2026-09-05T00:00:00.000Z' }), full('b')]));
  const next = applyExpense(state, 'home', full('c', { createdAt: '2026-09-09T00:00:00.000Z' }), true);
  assert.deepEqual(ids(next), ['c', 'a', 'b']);
  assert.equal(next.listsByHousehold.home.pagination.total, 3);
  assert.deepEqual(ids(state), ['a', 'b'], 'the previous cache is not mutated');
});

test('a created expense that does not match the filter is remembered but not listed', () => {
  const state = storeExpensePage(cache(), 'home', { category: 'RENT' }, 1, page([full('a', { category: 'RENT' })]));
  const next = applyExpense(state, 'home', full('b'), true);
  assert.deepEqual(ids(next), ['a']);
  assert.equal(next.listsByHousehold.home.pagination.total, 1);
  assert.equal(next.expensesById.b.id, 'b');
});

test('an updated expense is replaced in place, or dropped when it leaves the filter', () => {
  const state = storeExpensePage(cache(), 'home', { category: 'RENT' }, 1, page([full('a', { category: 'RENT' }), full('b', { category: 'RENT' })]));
  const renamed = applyExpense(state, 'home', full('a', { category: 'RENT', description: 'September' }));
  assert.equal(renamed.listsByHousehold.home.expenses.find((item) => item.id === 'a').description, 'September');
  assert.equal(renamed.listsByHousehold.home.pagination.total, 2);
  const moved = applyExpense(renamed, 'home', full('a', { category: 'UTILITIES' }));
  assert.deepEqual(ids(moved), ['b']);
  assert.equal(moved.listsByHousehold.home.pagination.total, 1);
  assert.equal(moved.expensesById.a.category, 'UTILITIES');
});

test('an updated expense not in the list only updates the id map', () => {
  const state = storeExpensePage(cache(), 'home', {}, 1, page([full('a')], { total: 30, totalPages: 2 }));
  const next = applyExpense(state, 'home', full('far-away'));
  assert.deepEqual(ids(next), ['a']);
  assert.equal(next.listsByHousehold.home.pagination.total, 30);
  assert.equal(next.expensesById['far-away'].id, 'far-away');
});

test('applying an expense with no list loaded only fills the id map', () => {
  const next = applyExpense(cache(), 'home', full('a'));
  assert.deepEqual(next.listsByHousehold, {});
  assert.equal(next.expensesById.a.id, 'a');
});

test('forgetting an expense removes it everywhere and lowers the total, never below zero', () => {
  const state = storeExpensePage(cache(), 'home', {}, 1, page([full('a')]));
  const next = forgetExpense(state, 'home', 'a');
  assert.deepEqual(ids(next), []);
  assert.deepEqual(next.listsByHousehold.home.pagination, { page: 1, limit: 20, total: 0, totalPages: 0 });
  assert.equal(next.expensesById.a, undefined);
  assert.deepEqual(ids(state), ['a'], 'the previous cache is not mutated');
  const again = forgetExpense(next, 'home', 'a');
  assert.equal(again.listsByHousehold.home.pagination.total, 0);
});
