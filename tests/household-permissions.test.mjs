import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assignableRoles, canAssignRole, canChangeRole, canManageMember, canManageMembers, canRemoveMember, isHouseholdRole,
} from '../src/lib/household-permissions.ts';

// Expected values are the same expressions the backend's member tests use, so the UI matrix
// and the API matrix cannot drift apart silently.
const roles = ['OWNER', 'ADMIN', 'MEMBER'];
const assignable = ['ADMIN', 'MEMBER'];

test('only owners and admins can manage members at all', () => {
  assert.equal(canManageMembers('OWNER'), true);
  assert.equal(canManageMembers('ADMIN'), true);
  assert.equal(canManageMembers('MEMBER'), false);
});

test('adding follows the backend matrix', () => {
  for (const actor of roles) {
    for (const role of assignable) {
      const expected = actor === 'OWNER' || (actor === 'ADMIN' && role === 'MEMBER');
      assert.equal(canAssignRole(actor, role), expected, `${actor} adds ${role}`);
    }
  }
  assert.deepEqual(assignableRoles('OWNER'), ['ADMIN', 'MEMBER']);
  assert.deepEqual(assignableRoles('ADMIN'), ['MEMBER']);
  assert.deepEqual(assignableRoles('MEMBER'), []);
});

test('changing roles follows the backend matrix', () => {
  for (const actor of roles) {
    for (const target of roles) {
      for (const role of assignable) {
        const expected = target !== 'OWNER' && (actor === 'OWNER' || (actor === 'ADMIN' && target === 'MEMBER' && role === 'MEMBER'));
        assert.equal(canChangeRole(actor, target, role), expected, `${actor} changes ${target} to ${role}`);
      }
    }
  }
});

test('removing follows the backend matrix and never allows self-removal', () => {
  for (const actor of roles) {
    for (const target of roles) {
      const expected = target !== 'OWNER' && (actor === 'OWNER' || (actor === 'ADMIN' && target === 'MEMBER'));
      assert.equal(canManageMember(actor, target), expected, `${actor} manages ${target}`);
      assert.equal(canRemoveMember(actor, target, false), expected, `${actor} removes ${target}`);
      assert.equal(canRemoveMember(actor, target, true), false, `${actor} removes self as ${target}`);
    }
  }
});

test('recognises only the three backend roles', () => {
  for (const role of roles) assert.equal(isHouseholdRole(role), true);
  for (const value of ['owner', '', null, undefined, 1, 'SUPERUSER']) assert.equal(isHouseholdRole(value), false);
});
