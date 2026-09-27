// Pure cache functions for the posts feature. No React or network code, so Node can test them
// directly. Each returns a new cache and leaves the given one untouched, which is what a Zustand
// `set` expects. Only type imports cross into other modules, which Node strips before running.
import type { CommentPage, Post, PostComment, PostPage } from '@/api/posts';

// One household's feed: the posts in feed order (newest first) and where the next, older page
// starts. `nextCursor` null means the end was reached.
export type Feed = { posts: Post[]; nextCursor: string | null };
// One post's comments, oldest first, with where the next, newer page starts.
export type Comments = { comments: PostComment[]; nextCursor: string | null };

export type PostCache = {
  feedsByHousehold: Record<string, Feed>;
  commentsByPost: Record<string, Comments>;
};

export const emptyPostCache: PostCache = { feedsByHousehold: {}, commentsByPost: {} };

// Records a fetched feed page. The first page replaces the household's feed; a page fetched with a
// cursor continues it. A post already shown is dropped from the older page rather than repeated,
// which can happen when a post was deleted between requests and the pages shifted.
export function storeFeedPage(cache: PostCache, householdId: string, page: PostPage, cursor?: string): PostCache {
  const current = cursor ? cache.feedsByHousehold[householdId] : undefined;
  const posts = current ? mergeRows(current.posts, page.posts, false) : page.posts;
  return withFeed(cache, householdId, { posts, nextCursor: page.nextCursor });
}

// Replaces a post wherever the feed shows it: after a like, or a fresh fetch of the detail screen.
// A post the feed never loaded is left for the next refresh; the detail screen has its own copy.
export function applyPost(cache: PostCache, post: Post): PostCache {
  const feed = cache.feedsByHousehold[post.householdId];
  if (!feed || !feed.posts.some((row) => row.id === post.id)) return cache;
  return withFeed(cache, post.householdId, { ...feed, posts: feed.posts.map((row) => (row.id === post.id ? post : row)) });
}

// Puts a post the person just wrote at the top of their feed, so it is there when they return.
export function prependPost(cache: PostCache, post: Post): PostCache {
  const feed = cache.feedsByHousehold[post.householdId];
  if (!feed) return cache;
  return withFeed(cache, post.householdId, { ...feed, posts: [post, ...feed.posts.filter((row) => row.id !== post.id)] });
}

export function forgetPost(cache: PostCache, householdId: string, postId: string): PostCache {
  const feed = cache.feedsByHousehold[householdId];
  const comments = { ...cache.commentsByPost };
  delete comments[postId];
  return {
    feedsByHousehold: feed
      ? { ...cache.feedsByHousehold, [householdId]: { ...feed, posts: feed.posts.filter((row) => row.id !== postId) } }
      : cache.feedsByHousehold,
    commentsByPost: comments,
  };
}

// Records a fetched comment page, oldest first. The first page replaces the post's comments; a
// page fetched with a cursor continues it, dropping any comment already shown.
export function storeCommentPage(cache: PostCache, postId: string, page: CommentPage, cursor?: string): PostCache {
  const current = cursor ? cache.commentsByPost[postId] : undefined;
  const comments = current ? mergeRows(current.comments, page.comments, true) : page.comments;
  return withComments(cache, postId, { comments, nextCursor: page.nextCursor });
}

// Appends a comment the person just wrote. The list may be mid-page, but their comment is the
// newest, so the end of the list is its true place once every older page has loaded.
export function appendComment(cache: PostCache, comment: PostComment): PostCache {
  const current = cache.commentsByPost[comment.postId];
  if (!current) return cache;
  return withComments(cache, comment.postId, {
    ...current,
    comments: [...current.comments.filter((row) => row.id !== comment.id), comment],
  });
}

export function forgetComment(cache: PostCache, postId: string, commentId: string): PostCache {
  const current = cache.commentsByPost[postId];
  if (!current) return cache;
  return withComments(cache, postId, { ...current, comments: current.comments.filter((row) => row.id !== commentId) });
}

// The feed's copy of a post after its comment count moved by `delta` (a comment written or deleted).
export function adjustCommentCount(cache: PostCache, householdId: string, postId: string, delta: number): PostCache {
  const feed = cache.feedsByHousehold[householdId];
  if (!feed) return cache;
  return withFeed(cache, householdId, {
    ...feed,
    posts: feed.posts.map((row) => (row.id === postId ? { ...row, commentCount: Math.max(0, row.commentCount + delta) } : row)),
  });
}

const withFeed = (cache: PostCache, householdId: string, feed: Feed): PostCache =>
  ({ ...cache, feedsByHousehold: { ...cache.feedsByHousehold, [householdId]: feed } });

const withComments = (cache: PostCache, postId: string, comments: Comments): PostCache =>
  ({ ...cache, commentsByPost: { ...cache.commentsByPost, [postId]: comments } });

// Joins two pages, dropping duplicates. The feed continues with older posts, comments with newer
// ones, so the incoming page goes after the existing rows either way; `preferIncoming` says whose
// copy of a duplicate row wins (a comment fetched again is fresher than the appended copy).
function mergeRows<Row extends { id: string }>(existing: Row[], incoming: Row[], preferIncoming: boolean): Row[] {
  if (preferIncoming) {
    const incomingIds = new Set(incoming.map((row) => row.id));
    return [...existing.filter((row) => !incomingIds.has(row.id)), ...incoming];
  }
  const existingIds = new Set(existing.map((row) => row.id));
  return [...existing, ...incoming.filter((row) => !existingIds.has(row.id))];
}
