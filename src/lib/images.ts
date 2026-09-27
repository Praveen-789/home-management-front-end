// Pure helpers for photos. No React, Expo or network code, so Node can test them directly.

// The backend refuses a sixth image on a task or expense.
export const MAX_IMAGES = 5;

// Photos are shrunk before upload so a phone camera's 12-megapixel shot does not go over the air.
// Cloudinary caps stored images at 2000 pixels anyway; this keeps uploads quick on mobile data.
export const MAX_UPLOAD_SIDE = 1600;

// A profile picture is small in lists, but a tap opens it in a viewer that fills most of a phone
// screen, so it is uploaded large enough to look sharp there. Still far below a task photo.
export const PROFILE_UPLOAD_SIDE = 1024;

// The backend delivers every profile picture as a 400 pixel square, which suits an avatar. The
// viewer asks Cloudinary for the same crop at this size instead.
export const PROFILE_VIEW_SIDE = 1000;
const AVATAR_SIZE = 'w_400,h_400';

// Cloudinary resizes on request, so a larger picture is the same URL with a different size in it.
// A URL that does not look like one of ours comes back unchanged, and the viewer shows that.
export function largePictureUrl(url: string): string {
  return url.replace(`,${AVATAR_SIZE},`, `,w_${PROFILE_VIEW_SIDE},h_${PROFILE_VIEW_SIDE},`);
}

// "Praveen Kumar" becomes "PK", shown while a person has no picture. Array.from keeps an emoji or
// an accented letter in one piece.
export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]?.toUpperCase() ?? '').join('') || '?';
}

// A chat photo is shown about 240 points wide, so three times that covers the sharpest phone
// screens. Cloudinary shrinks it on request and keeps its shape; the full file opens on a tap.
// A URL that does not look like one of ours comes back unchanged.
const CHAT_PHOTO_SIDE = 720;
export function chatPhotoUrl(url: string): string {
  return url.replace('/image/upload/f_auto,q_auto/', `/image/upload/c_limit,w_${CHAT_PHOTO_SIDE},h_${CHAT_PHOTO_SIDE},f_auto,q_auto/`);
}

// How big a photo appears in a chat bubble: `maxWidth` wide, with the height following the photo's
// shape from a wide letterbox to a tall portrait. Anything beyond that is cropped. A photo without
// a known size shows square.
export function chatPhotoSize(width: number | undefined, height: number | undefined, maxWidth = 240): { width: number; height: number } {
  const ratio = width && height && width > 0 && height > 0 ? height / width : 1;
  return { width: maxWidth, height: Math.round(Math.min(maxWidth * 4 / 3, Math.max(maxWidth * 0.6, maxWidth * ratio))) };
}

export function remainingImageSlots(count: number): number {
  return Math.max(0, MAX_IMAGES - count);
}

// The size to resize to so the longest side is at most `maxSide`, with the other side left for the
// resizer to work out. Null when the image is already small enough.
export function uploadSize(width: number, height: number, maxSide = MAX_UPLOAD_SIDE): { width: number | null; height: number | null } | null {
  if (width <= maxSide && height <= maxSide) return null;
  return width >= height ? { width: maxSide, height: null } : { width: null, height: maxSide };
}

// A file name for the multipart part. Cloudinary only reads its extension.
export function imageFileName(format: string, now: number): string {
  return `photo-${now}.${format}`;
}

// "345678" bytes reads as "338 KB"; anything from a megabyte up shows one decimal.
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
