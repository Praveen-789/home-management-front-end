import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  adjustCommentCount, appendComment, applyPost, emptyPostCache, forgetComment, forgetPost, prependPost, storeCommentPage, storeFeedPage,
} from '../src/lib/post-helpers.ts';

const author = { id: 'user-1', name: 'Asha', email: 'asha@example.com', avatarUrl: null };
const post = (id, over = {}) => ({
  id, householdId: 'home', text: `Post ${id}`, createdAt: '2026-09-27T10:00:00.000Z',
  author, images: [], likeCount: 0, commentCount: 0, likedByMe: false, ...over,
});
const comment = (id, over = {}) => ({ id, postId: 'p1', text: `Comment ${id}`, createdAt: '2026-09-27T11:00:00.000Z', author, ...over });

test('the first feed page replaces and a cursor page continues without repeats', () => {
  let cache = storeFeedPage(emptyPostCache, 'home', { posts: [post('p2'), post('p1')], nextCursor: 'c1' });
  assert.deepEqual(cache.feedsByHousehold.home.posts.map((row) => row.id), ['p2', 'p1']);
  assert.equal(cache.feedsByHousehold.home.nextCursor, 'c1');
  // The older page repeats p1 because a deletion shifted the pages; the copy already shown wins.
  cache = storeFeedPage(cache, 'home', { posts: [post('p1'), post('p0')], nextCursor: null }, 'c1');
  assert.deepEqual(cache.feedsByHousehold.home.posts.map((row) => row.id), ['p2', 'p1', 'p0']);
  assert.equal(cache.feedsByHousehold.home.nextCursor, null);
  // A fresh first page starts over.
  cache = storeFeedPage(cache, 'home', { posts: [post('p3')], nextCursor: null });
  assert.deepEqual(cache.feedsByHousehold.home.posts.map((row) => row.id), ['p3']);
  // Households do not mix.
  cache = storeFeedPage(cache, 'other', { posts: [post('p9', { householdId: 'other' })], nextCursor: null });
  assert.deepEqual(cache.feedsByHousehold.home.posts.map((row) => row.id), ['p3']);
});

test('applyPost replaces the feed copy and ignores posts the feed never loaded', () => {
  const cache = storeFeedPage(emptyPostCache, 'home', { posts: [post('p1')], nextCursor: null });
  const liked = applyPost(cache, post('p1', { likeCount: 3, likedByMe: true }));
  assert.equal(liked.feedsByHousehold.home.posts[0].likeCount, 3);
  assert.equal(applyPost(cache, post('p9')), cache);
  assert.equal(applyPost(emptyPostCache, post('p1')), emptyPostCache);
});

test('prependPost puts a new post on top, once', () => {
  let cache = storeFeedPage(emptyPostCache, 'home', { posts: [post('p1')], nextCursor: null });
  cache = prependPost(cache, post('p2'));
  cache = prependPost(cache, post('p2'));
  assert.deepEqual(cache.feedsByHousehold.home.posts.map((row) => row.id), ['p2', 'p1']);
  // No feed loaded yet: nothing to put it in front of.
  assert.equal(prependPost(emptyPostCache, post('p2')), emptyPostCache);
});

test('forgetPost removes the post and its comments', () => {
  let cache = storeFeedPage(emptyPostCache, 'home', { posts: [post('p1'), post('p2')], nextCursor: null });
  cache = storeCommentPage(cache, 'p1', { comments: [comment('c1')], nextCursor: null });
  cache = forgetPost(cache, 'home', 'p1');
  assert.deepEqual(cache.feedsByHousehold.home.posts.map((row) => row.id), ['p2']);
  assert.equal(cache.commentsByPost.p1, undefined);
});

test('comment pages continue oldest-first and a refetched comment wins over the appended copy', () => {
  let cache = storeCommentPage(emptyPostCache, 'p1', { comments: [comment('c1'), comment('c2')], nextCursor: 'c' });
  cache = appendComment(cache, comment('c9', { text: 'Mine' }));
  assert.deepEqual(cache.commentsByPost.p1.comments.map((row) => row.id), ['c1', 'c2', 'c9']);
  // The next page includes c9 as the server stored it; the appended copy makes way for it.
  cache = storeCommentPage(cache, 'p1', { comments: [comment('c3'), comment('c9', { text: 'Mine, stored' })], nextCursor: null }, 'c');
  assert.deepEqual(cache.commentsByPost.p1.comments.map((row) => row.id), ['c1', 'c2', 'c3', 'c9']);
  assert.equal(cache.commentsByPost.p1.comments.at(-1).text, 'Mine, stored');
  assert.equal(cache.commentsByPost.p1.nextCursor, null);
  // Appending to a post whose comments were never loaded waits for the first fetch.
  assert.equal(appendComment(emptyPostCache, comment('c1')), emptyPostCache);
});

test('forgetComment removes one comment and leaves the rest', () => {
  let cache = storeCommentPage(emptyPostCache, 'p1', { comments: [comment('c1'), comment('c2')], nextCursor: null });
  cache = forgetComment(cache, 'p1', 'c1');
  assert.deepEqual(cache.commentsByPost.p1.comments.map((row) => row.id), ['c2']);
  assert.equal(forgetComment(emptyPostCache, 'p1', 'c1'), emptyPostCache);
});

test('adjustCommentCount moves the feed copy and never goes below zero', () => {
  let cache = storeFeedPage(emptyPostCache, 'home', { posts: [post('p1', { commentCount: 1 })], nextCursor: null });
  cache = adjustCommentCount(cache, 'home', 'p1', 1);
  assert.equal(cache.feedsByHousehold.home.posts[0].commentCount, 2);
  cache = adjustCommentCount(cache, 'home', 'p1', -1);
  cache = adjustCommentCount(cache, 'home', 'p1', -1);
  cache = adjustCommentCount(cache, 'home', 'p1', -1);
  assert.equal(cache.feedsByHousehold.home.posts[0].commentCount, 0);
  assert.equal(adjustCommentCount(emptyPostCache, 'home', 'p1', 1), emptyPostCache);
});

test('every helper leaves the given cache untouched', () => {
  const cache = storeFeedPage(emptyPostCache, 'home', { posts: [post('p1')], nextCursor: 'c1' });
  const snapshot = JSON.stringify(cache);
  storeFeedPage(cache, 'home', { posts: [post('p2')], nextCursor: null }, 'c1');
  applyPost(cache, post('p1', { likeCount: 5 }));
  prependPost(cache, post('p3'));
  forgetPost(cache, 'home', 'p1');
  storeCommentPage(cache, 'p1', { comments: [comment('c1')], nextCursor: null });
  adjustCommentCount(cache, 'home', 'p1', 1);
  assert.equal(JSON.stringify(cache), snapshot);
});
