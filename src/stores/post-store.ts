import { create } from 'zustand';
import type { ImageFile } from '@/api/images';
import * as postsApi from '@/api/posts';
import type { Post, PostComment } from '@/api/posts';
import {
  adjustCommentCount,
  appendComment,
  applyPost,
  emptyPostCache,
  forgetComment,
  forgetPost,
  prependPost,
  storeCommentPage,
  storeFeedPage,
  type PostCache,
} from '@/lib/post-helpers';
import { useAuthStore } from '@/stores/auth-store';
import { withToken } from '@/stores/with-token';

export const PAGE_SIZE = 20;

type PostState = PostCache & {
  // No cursor fetches a fresh first page; the feed's nextCursor fetches the page after it.
  loadFeed: (householdId: string, cursor?: string) => Promise<void>;
  // Returns the post straight to the caller: the detail screen may show a post
  // (say, from a notification) whose feed page was never loaded.
  loadPost: (householdId: string, postId: string) => Promise<Post>;
  createPost: (householdId: string, text: string, files: ImageFile[]) => Promise<Post>;
  deletePost: (householdId: string, postId: string) => Promise<void>;
  setLike: (householdId: string, postId: string, liked: boolean) => Promise<Post>;
  loadComments: (householdId: string, postId: string, cursor?: string) => Promise<void>;
  addComment: (householdId: string, postId: string, text: string) => Promise<PostComment>;
  deleteComment: (householdId: string, postId: string, commentId: string) => Promise<void>;
  reset: () => void;
};

// The newest feed request per household, so a slow first page cannot overwrite a fresher one.
// Kept outside the state because no screen reads it.
const latestFeed: Record<string, number> = {};
let requestCount = 0;

export const usePostStore = create<PostState>((set, get) => ({
  ...emptyPostCache,
  loadFeed: async (householdId, cursor) => {
    const requestId = ++requestCount;
    latestFeed[householdId] = requestId;
    const page = await withToken((token) => postsApi.listPosts(token, householdId, PAGE_SIZE, cursor));
    if (latestFeed[householdId] !== requestId) return;
    set(storeFeedPage(get(), householdId, page, cursor));
  },
  loadPost: async (householdId, postId) => {
    const post = await withToken((token) => postsApi.getPost(token, householdId, postId));
    set(applyPost(get(), post));
    return post;
  },
  // The photos go to Cloudinary one at a time, then the post is created with all of them. A photo
  // uploaded for a post that then fails stays unattached in Cloudinary and harms nothing.
  createPost: async (householdId, text, files) => {
    const post = await withToken(async (token) => {
      const images = [];
      for (const file of files) images.push(await postsApi.uploadPostImage(token, householdId, file));
      return postsApi.createPost(token, householdId, text, images);
    });
    set(prependPost(get(), post));
    return post;
  },
  deletePost: async (householdId, postId) => {
    await withToken((token) => postsApi.deletePost(token, householdId, postId));
    set(forgetPost(get(), householdId, postId));
  },
  setLike: async (householdId, postId, liked) => {
    const post = await withToken((token) => postsApi.setPostLike(token, householdId, postId, liked));
    set(applyPost(get(), post));
    return post;
  },
  loadComments: async (householdId, postId, cursor) => {
    const page = await withToken((token) => postsApi.listComments(token, householdId, postId, PAGE_SIZE, cursor));
    set(storeCommentPage(get(), postId, page, cursor));
  },
  addComment: async (householdId, postId, text) => {
    const comment = await withToken((token) => postsApi.addComment(token, householdId, postId, text));
    set(adjustCommentCount(appendComment(get(), comment), householdId, postId, 1));
    return comment;
  },
  deleteComment: async (householdId, postId, commentId) => {
    await withToken((token) => postsApi.deleteComment(token, householdId, postId, commentId));
    set(adjustCommentCount(forgetComment(get(), postId, commentId), householdId, postId, -1));
  },
  reset: () => set(emptyPostCache),
}));

// Post data belongs to one user; drop it on sign-out or when a different user signs in.
useAuthStore.subscribe((state, previous) => {
  if (state.session?.user.id !== previous.session?.user.id) usePostStore.getState().reset();
});
