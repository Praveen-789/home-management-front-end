import type { User } from '@/api/auth';
import { apiRequest } from '@/api/client';

// Where the signed-in user asks for permission to upload a new profile picture.
export const AVATAR_UPLOADS_PATH = '/users/me/avatar/uploads';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export function isUser(value: unknown): value is User {
  return isRecord(value) && typeof value.id === 'string' && !!value.id && typeof value.name === 'string' && typeof value.email === 'string' &&
    (value.avatarUrl === undefined || value.avatarUrl === null || typeof value.avatarUrl === 'string');
}

function readUser(data: unknown): User {
  const user = isRecord(data) ? data.user : undefined;
  if (!isUser(user)) throw new Error('Unexpected response from HomeHub. Please try again.');
  return user;
}

// "me" is always the user the token belongs to, so none of these can touch another account.
export async function getProfile(token: string): Promise<User> {
  return readUser(await apiRequest('/users/me', { token }));
}

// `publicId` comes from the upload ticket, after Cloudinary accepted the file.
export async function setAvatar(token: string, publicId: string): Promise<User> {
  return readUser(await apiRequest('/users/me/avatar', { method: 'PUT', body: { publicId }, token }));
}

export async function removeAvatar(token: string): Promise<User> {
  return readUser(await apiRequest('/users/me/avatar', { method: 'DELETE', token }));
}
