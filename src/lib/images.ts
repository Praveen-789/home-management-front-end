// Pure helpers for photos. No React, Expo or network code, so Node can test them directly.

// The backend refuses a sixth image on a task or expense.
export const MAX_IMAGES = 5;

// Photos are shrunk before upload so a phone camera's 12-megapixel shot does not go over the air.
// Cloudinary caps stored images at 2000 pixels anyway; this keeps uploads quick on mobile data.
export const MAX_UPLOAD_SIDE = 1600;

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
