import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import type { User } from '@/api/auth';
import { apiRequest } from '@/api/client';

// A photo attached to a task or an expense, as the backend returns it. The file lives in
// Cloudinary; both URLs are ready to display, the thumbnail cropped square.
export type Photo = {
  id: string;
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
  createdAt: string;
  uploadedBy: User;
};

// The backend's permission to upload one file straight to Cloudinary. `fields` go into the
// multipart form exactly as given; Cloudinary recomputes the signature over them.
export type UploadTicket = { uploadUrl: string; fields: Record<string, string>; publicId: string; allowedFormats: string[]; expiresAt: string };

// What the backend records once Cloudinary has accepted the file.
export type ImageInput = { publicId: string; width: number; height: number; bytes: number; format: string };

// A local file ready to upload, as the picker produces it.
export type ImageFile = { uri: string; name: string; type: string };

const unexpectedResponse = () => new Error('Unexpected response from HomeHub. Please try again.');
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isUser = (value: unknown): value is User =>
  isRecord(value) && typeof value.id === 'string' && !!value.id && typeof value.name === 'string' && typeof value.email === 'string';

export function isPhoto(value: unknown): value is Photo {
  return isRecord(value) && typeof value.id === 'string' && !!value.id && typeof value.url === 'string' && typeof value.thumbnailUrl === 'string' &&
    typeof value.width === 'number' && typeof value.height === 'number' && typeof value.bytes === 'number' && typeof value.format === 'string' &&
    typeof value.createdAt === 'string' && isUser(value.uploadedBy);
}

function isUploadTicket(value: unknown): value is UploadTicket {
  return isRecord(value) && typeof value.uploadUrl === 'string' && isRecord(value.fields) &&
    Object.values(value.fields).every((field) => typeof field === 'string') && typeof value.publicId === 'string' && !!value.publicId &&
    Array.isArray(value.allowedFormats) && typeof value.expiresAt === 'string';
}

export async function requestUpload(token: string, householdId: string): Promise<UploadTicket> {
  const data = await apiRequest(`/households/${encodeURIComponent(householdId)}/uploads`, { method: 'POST', token });
  const upload = isRecord(data) ? data.upload : undefined;
  if (!isUploadTicket(upload)) throw unexpectedResponse();
  return upload;
}

const UPLOAD_TIMEOUT = 60000;
const UPLOAD_ERROR = 'Could not upload the photo. Please try again.';

// Sends the file to Cloudinary with the ticket's signed fields. Cloudinary answers with the
// stored file's details, which the backend then records against the task or expense.
export async function uploadToCloudinary(ticket: UploadTicket, file: ImageFile): Promise<ImageInput> {
  const form = new FormData();
  for (const [key, value] of Object.entries(ticket.fields)) form.append(key, value);
  // Expo replaces the global fetch with its own, which sends only strings and Blob-like parts and
  // refuses React Native's { uri, name, type } file description. expo-file-system's File implements
  // Blob over a local URI, so it carries the bytes on native; a browser reads them from the URI.
  if (Platform.OS === 'web') form.append('file', await (await fetch(file.uri)).blob(), file.name);
  else form.append('file', new File(file.uri), file.name);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT);
  let data: unknown;
  let ok: boolean;
  try {
    const response = await fetch(ticket.uploadUrl, { method: 'POST', body: form, signal: controller.signal });
    ok = response.ok;
    data = await response.json().catch(() => null);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The upload timed out. Please try again.');
    // React Native reports every transport problem as "Network request failed", so the underlying
    // text goes to the console for diagnosis and rides along in the message shown to the person.
    console.warn('Cloudinary upload failed', error);
    const detail = error instanceof Error && error.message ? ` (${error.message})` : '';
    throw new Error(`Cannot reach the photo service${detail}. Check your connection and try again.`);
  } finally {
    clearTimeout(timeout);
  }

  if (!ok) {
    const message = isRecord(data) && isRecord(data.error) ? data.error.message : undefined;
    throw new Error(typeof message === 'string' && message ? `Photo rejected: ${message}` : UPLOAD_ERROR);
  }
  if (!isRecord(data) || data.public_id !== ticket.publicId || typeof data.width !== 'number' || typeof data.height !== 'number' ||
    typeof data.bytes !== 'number' || typeof data.format !== 'string') throw new Error(UPLOAD_ERROR);
  return { publicId: ticket.publicId, width: data.width, height: data.height, bytes: data.bytes, format: data.format.toLowerCase() };
}

// The whole client side of an upload: permission from HomeHub, then the file to Cloudinary.
export async function uploadImage(token: string, householdId: string, file: ImageFile): Promise<ImageInput> {
  const ticket = await requestUpload(token, householdId);
  return uploadToCloudinary(ticket, file);
}
