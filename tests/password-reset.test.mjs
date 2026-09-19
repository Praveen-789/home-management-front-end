import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCompleteCode, isEmail, normalizeCode, passwordProblem, resendWait } from '../src/lib/password-reset.ts';

test('accepts ordinary email addresses and trims around them', () => {
  assert.equal(isEmail('praveen@example.com'), true);
  assert.equal(isEmail('  praveen@example.com  '), true);
  for (const text of ['', 'praveen', 'praveen@', '@example.com', 'a b@example.com']) assert.equal(isEmail(text), false, text);
});

test('normalizes pasted codes to six digits', () => {
  assert.equal(normalizeCode('482913'), '482913');
  assert.equal(normalizeCode(' 482 913\n'), '482913');
  assert.equal(normalizeCode('4829137'), '482913');
  assert.equal(normalizeCode('48ab29'), '4829');
  assert.equal(isCompleteCode('482913'), true);
  for (const code of ['', '48291', '4829131', '48291a']) assert.equal(isCompleteCode(code), false, code);
});

test('explains why a new password cannot be used, matching the backend rules', () => {
  assert.equal(passwordProblem('short', 'short'), 'Use at least 8 characters.');
  assert.equal(passwordProblem('x'.repeat(73), 'x'.repeat(73)), 'Use at most 72 characters.');
  assert.equal(passwordProblem('longenough', 'different'), 'Your passwords do not match.');
  assert.equal(passwordProblem('longenough', 'longenough'), null);
  assert.equal(passwordProblem('x'.repeat(72), 'x'.repeat(72)), null);
});

test('counts down the resend cooldown in whole seconds', () => {
  const sentAt = 1_000_000;
  assert.equal(resendWait(0, sentAt), 0);
  assert.equal(resendWait(sentAt, sentAt), 60);
  assert.equal(resendWait(sentAt, sentAt + 100), 60);
  assert.equal(resendWait(sentAt, sentAt + 59_001), 1);
  assert.equal(resendWait(sentAt, sentAt + 60_000), 0);
  assert.equal(resendWait(sentAt, sentAt + 120_000), 0);
});
