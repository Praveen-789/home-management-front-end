import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canManageExpense, CATEGORY_ICONS, CATEGORY_LABELS, EXPENSE_CATEGORIES, isExpenseCategory,
} from '../src/lib/expense-permissions.ts';

// Expected values are the same expressions the backend's expense tests use, so the UI matrix
// and the API matrix cannot drift apart silently.
const roles = ['OWNER', 'ADMIN', 'MEMBER'];
const me = 'actor';
const relations = {
  recorder: { createdBy: { id: me }, paidBy: { id: 'someone' } },
  payer: { createdBy: { id: 'someone' }, paidBy: { id: me } },
  'recorder and payer': { createdBy: { id: me }, paidBy: { id: me } },
  bystander: { createdBy: { id: 'someone' }, paidBy: { id: 'other' } },
};

test('managing (edit any field, delete) follows the backend matrix', () => {
  for (const actor of roles) {
    for (const [relation, expense] of Object.entries(relations)) {
      const expected = actor !== 'MEMBER' || expense.createdBy.id === me || expense.paidBy.id === me;
      assert.equal(canManageExpense(actor, expense, me), expected, `${actor} as ${relation}`);
    }
  }
});

test('recognises only the backend categories, each with a label and an icon', () => {
  assert.deepEqual(EXPENSE_CATEGORIES, ['GROCERIES', 'UTILITIES', 'RENT', 'MAINTENANCE', 'TRANSPORT', 'HEALTH', 'ENTERTAINMENT', 'OTHER']);
  for (const category of EXPENSE_CATEGORIES) {
    assert.equal(isExpenseCategory(category), true);
    assert.equal(typeof CATEGORY_LABELS[category], 'string');
    assert.equal(typeof CATEGORY_ICONS[category], 'string');
  }
  for (const value of ['groceries', 'Rent', '', null, undefined, 1, 'FOOD']) {
    assert.equal(isExpenseCategory(value), false);
  }
});
