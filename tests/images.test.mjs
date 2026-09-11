import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatBytes, imageFileName, MAX_IMAGES, MAX_UPLOAD_SIDE, remainingImageSlots, uploadSize } from '../src/lib/images.ts';

test('counts the slots left under the backend limit, never below zero', () => {
  assert.equal(MAX_IMAGES, 5);
  assert.equal(remainingImageSlots(0), 5);
  assert.equal(remainingImageSlots(4), 1);
  assert.equal(remainingImageSlots(5), 0);
  assert.equal(remainingImageSlots(9), 0);
});

test('resizes only the longest side, and only when it is over the limit', () => {
  assert.equal(MAX_UPLOAD_SIDE, 1600);
  assert.equal(uploadSize(1600, 1200), null);
  assert.equal(uploadSize(800, 600), null);
  assert.deepEqual(uploadSize(4000, 3000), { width: 1600, height: null });
  assert.deepEqual(uploadSize(3000, 4000), { width: null, height: 1600 });
  assert.deepEqual(uploadSize(2000, 2000), { width: 1600, height: null });
  assert.deepEqual(uploadSize(4000, 100, 500), { width: 500, height: null });
});

test('names the upload by time and format', () => {
  assert.equal(imageFileName('jpg', 1757500000000), 'photo-1757500000000.jpg');
});

test('formats sizes the way people read them', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(345678), '338 KB');
  assert.equal(formatBytes(1024 * 1024), '1.0 MB');
  assert.equal(formatBytes(2.35 * 1024 * 1024), '2.4 MB');
});
