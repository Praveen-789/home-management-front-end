import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canChangeStatus, canManageTask, isTaskPriority, isTaskStatus, PRIORITY_LABELS, STATUS_LABELS, TASK_PRIORITIES, TASK_STATUSES,
} from '../src/lib/task-permissions.ts';

// Expected values are the same expressions the backend's task tests use, so the UI matrix
// and the API matrix cannot drift apart silently.
const roles = ['OWNER', 'ADMIN', 'MEMBER'];
const me = 'actor';
const relations = {
  creator: { createdBy: { id: me }, assignedTo: { id: 'someone' } },
  assignee: { createdBy: { id: 'someone' }, assignedTo: { id: me } },
  'creator and assignee': { createdBy: { id: me }, assignedTo: { id: me } },
  bystander: { createdBy: { id: 'someone' }, assignedTo: { id: 'other' } },
  'bystander on unassigned task': { createdBy: { id: 'someone' }, assignedTo: null },
};

test('managing (edit any field, delete) follows the backend matrix', () => {
  for (const actor of roles) {
    for (const [relation, task] of Object.entries(relations)) {
      const expected = actor !== 'MEMBER' || task.createdBy.id === me;
      assert.equal(canManageTask(actor, task, me), expected, `${actor} as ${relation}`);
    }
  }
});

test('changing status additionally allows the assignee', () => {
  for (const actor of roles) {
    for (const [relation, task] of Object.entries(relations)) {
      const manages = actor !== 'MEMBER' || task.createdBy.id === me;
      const expected = manages || task.assignedTo?.id === me;
      assert.equal(canChangeStatus(actor, task, me), expected, `${actor} as ${relation}`);
    }
  }
});

test('recognises only the backend statuses and priorities, each with a label', () => {
  assert.deepEqual(TASK_STATUSES, ['TODO', 'IN_PROGRESS', 'DONE']);
  assert.deepEqual(TASK_PRIORITIES, ['LOW', 'MEDIUM', 'HIGH']);
  for (const status of TASK_STATUSES) {
    assert.equal(isTaskStatus(status), true);
    assert.equal(typeof STATUS_LABELS[status], 'string');
  }
  for (const priority of TASK_PRIORITIES) {
    assert.equal(isTaskPriority(priority), true);
    assert.equal(typeof PRIORITY_LABELS[priority], 'string');
  }
  for (const value of ['todo', 'Done', '', null, undefined, 1, 'URGENT']) {
    assert.equal(isTaskStatus(value), false);
    assert.equal(isTaskPriority(value), false);
  }
});
