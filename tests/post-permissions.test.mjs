import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canDeleteComment, canDeletePost, canSubmitComment, canSubmitPost, MAX_COMMENT_TEXT, MAX_POST_IMAGES, MAX_POST_TEXT,
} from '../src/lib/post-permissions.ts';

test('owners and admins delete anything; members only their own', () => {
  for (const role of ['OWNER', 'ADMIN']) {
    assert.equal(canDeletePost(role, 'me', 'someone-else'), true, role);
    assert.equal(canDeleteComment(role, 'me', 'someone-else'), true, role);
  }
  assert.equal(canDeletePost('MEMBER', 'me', 'me'), true);
  assert.equal(canDeletePost('MEMBER', 'me', 'someone-else'), false);
  assert.equal(canDeleteComment('MEMBER', 'me', 'me'), true);
  assert.equal(canDeleteComment('MEMBER', 'me', 'someone-else'), false);
});

test('a post needs text or a photo, within the backend limits', () => {
  assert.equal(canSubmitPost('Hello', 0), true);
  assert.equal(canSubmitPost('', 1), true);
  assert.equal(canSubmitPost('Hello', MAX_POST_IMAGES), true);
  assert.equal(canSubmitPost('x'.repeat(MAX_POST_TEXT), 0), true);
  assert.equal(canSubmitPost('', 0), false);
  assert.equal(canSubmitPost('   ', 0), false);
  assert.equal(canSubmitPost('x'.repeat(MAX_POST_TEXT + 1), 0), false);
  assert.equal(canSubmitPost('Hello', MAX_POST_IMAGES + 1), false);
});

test('a comment needs text within the backend limit', () => {
  assert.equal(canSubmitComment('Count me in'), true);
  assert.equal(canSubmitComment('x'.repeat(MAX_COMMENT_TEXT)), true);
  assert.equal(canSubmitComment(''), false);
  assert.equal(canSubmitComment('   '), false);
  assert.equal(canSubmitComment('x'.repeat(MAX_COMMENT_TEXT + 1)), false);
});
