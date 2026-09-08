import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tokenExpiresAt } from '../src/api/token.ts';
const token = payload => `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
test('converts JWT expiry seconds to milliseconds', () => {
  assert.equal(tokenExpiresAt(token({ exp: 1800000000 })), 1800000000000);
});
test('rejects malformed tokens and missing or invalid expiry', () => {
  for (const value of ['', 'bad-token', token({}), token({ exp: '1800000000' })]) {
    assert.equal(tokenExpiresAt(value), 0);
  }
});
test('distinguishes expired sessions from active sessions', () => {
  const now = Date.now();
  assert.ok(tokenExpiresAt(token({ exp: Math.floor(now / 1000) - 60 })) < now);
  assert.ok(tokenExpiresAt(token({ exp: Math.floor(now / 1000) + 60 })) > now);
});
