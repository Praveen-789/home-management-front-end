import type { User } from '@/api/auth';
import { apiRequest } from '@/api/client';
import { isPhoto, uploadWithTicket, type ImageFile, type ImageInput, type Photo } from '@/api/images';

// A post as every post endpoint returns it. `text` is "" for a photo-only post. `likedByMe` is
// whether the signed-in person liked it; the counts are household-wide.
export type Post = {
  id: string;
  householdId: string;
  text: string;
  createdAt: string;
  author: User;
  images: Photo[];
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
};

// A comment on a post: plain text in a flat list, no replies and no editing.
export type PostComment = {
  id: string;
  postId: string;
  text: string;
  createdAt: string;
  author: User;
};

// One page of the feed or of a post's comments. `nextCursor` fetches the page after it, and is
// null on the last page. The app never looks inside a cursor; it only hands it back.
export type PostPage = { posts: Post[]; nextCursor: string | null };
export type CommentPage = { comments: PostComment[]; nextCursor: string | null };

const unexpectedResponse = () => new Error('Unexpected response from HomeHub. Please try again.');
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isUser = (value: unknown): value is User =>
  isRecord(value) && typeof value.id === 'string' && !!value.id && typeof value.name === 'string' && typeof value.email === 'string';

export function isPost(value: unknown): value is Post {
  return isRecord(value) && typeof value.id === 'string' && !!value.id && typeof value.householdId === 'string' &&
    typeof value.text === 'string' && typeof value.createdAt === 'string' && isUser(value.author) &&
    Array.isArray(value.images) && value.images.every(isPhoto) &&
    typeof value.likeCount === 'number' && typeof value.commentCount === 'number' && typeof value.likedByMe === 'boolean';
}

export function isPostComment(value: unknown): value is PostComment {
  return isRecord(value) && typeof value.id === 'string' && !!value.id && typeof value.postId === 'string' &&
    typeof value.text === 'string' && typeof value.createdAt === 'string' && isUser(value.author);
}

const postsPath = (householdId: string) => `/households/${encodeURIComponent(householdId)}/posts`;
const postPath = (householdId: string, postId: string) => `${postsPath(householdId)}/${encodeURIComponent(postId)}`;

const pageQuery = (limit: number, cursor?: string) =>
  `?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;

function readPost(data: unknown): Post {
  const post = isRecord(data) ? data.post : undefined;
  if (!isPost(post)) throw unexpectedResponse();
  return post;
}

export async function listPosts(token: string, householdId: string, limit: number, cursor?: string): Promise<PostPage> {
  const data = await apiRequest(`${postsPath(householdId)}${pageQuery(limit, cursor)}`, { token });
  const posts = isRecord(data) ? data.posts : undefined;
  const nextCursor = isRecord(data) ? data.nextCursor : undefined;
  if (!Array.isArray(posts) || !posts.every(isPost) || (nextCursor !== null && typeof nextCursor !== 'string')) throw unexpectedResponse();
  return { posts, nextCursor };
}

export async function getPost(token: string, householdId: string, postId: string): Promise<Post> {
  return readPost(await apiRequest(postPath(householdId, postId), { token }));
}

export async function createPost(token: string, householdId: string, text: string, images: ImageInput[]): Promise<Post> {
  return readPost(await apiRequest(postsPath(householdId), { method: 'POST', body: { text, images }, token }));
}

export async function deletePost(token: string, householdId: string, postId: string): Promise<void> {
  await apiRequest(postPath(householdId, postId), { method: 'DELETE', token });
}

// Both return the post with its new counts. Repeating either is harmless, so a retry after a lost
// response cannot double-count anything.
export async function setPostLike(token: string, householdId: string, postId: string, liked: boolean): Promise<Post> {
  return readPost(await apiRequest(`${postPath(householdId, postId)}/like`, { method: liked ? 'PUT' : 'DELETE', token }));
}

export async function listComments(token: string, householdId: string, postId: string, limit: number, cursor?: string): Promise<CommentPage> {
  const data = await apiRequest(`${postPath(householdId, postId)}/comments${pageQuery(limit, cursor)}`, { token });
  const comments = isRecord(data) ? data.comments : undefined;
  const nextCursor = isRecord(data) ? data.nextCursor : undefined;
  if (!Array.isArray(comments) || !comments.every(isPostComment) || (nextCursor !== null && typeof nextCursor !== 'string')) throw unexpectedResponse();
  return { comments, nextCursor };
}

export async function addComment(token: string, householdId: string, postId: string, text: string): Promise<PostComment> {
  const data = await apiRequest(`${postPath(householdId, postId)}/comments`, { method: 'POST', body: { text }, token });
  const comment = isRecord(data) ? data.comment : undefined;
  if (!isPostComment(comment)) throw unexpectedResponse();
  return comment;
}

export async function deleteComment(token: string, householdId: string, postId: string, commentId: string): Promise<void> {
  await apiRequest(`${postPath(householdId, postId)}/comments/${encodeURIComponent(commentId)}`, { method: 'DELETE', token });
}

// A photo for a new post of this household. Post photos have their own folder, so a ticket from
// here cannot be used for a task or chat photo, nor theirs here.
export function uploadPostImage(token: string, householdId: string, file: ImageFile): Promise<ImageInput> {
  return uploadWithTicket(token, `${postsPath(householdId)}/uploads`, file);
}
