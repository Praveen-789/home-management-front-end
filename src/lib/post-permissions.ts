// Mirrors the backend's post permission rules, so the app can hide what a request would refuse.
// No React or network code, so Node can test it directly. Only type imports cross into other
// modules, which Node strips before running.
import type { HouseholdRole } from '@/lib/household-permissions';

export const MAX_POST_TEXT = 4000;
export const MAX_COMMENT_TEXT = 1000;
export const MAX_POST_IMAGES = 5;

// Members manage what they wrote themselves. Owners and admins look after the whole household, so
// they may remove anyone's post or comment. The same rule covers both.
export function canDeletePost(role: HouseholdRole, userId: string, authorId: string): boolean {
  return role !== 'MEMBER' || authorId === userId;
}

export const canDeleteComment = canDeletePost;

// Whether the backend would accept this post: text, a photo, or both, within the limits.
export function canSubmitPost(text: string, imageCount: number): boolean {
  const trimmed = text.trim();
  return (trimmed.length > 0 || imageCount > 0) && trimmed.length <= MAX_POST_TEXT && imageCount <= MAX_POST_IMAGES;
}

export function canSubmitComment(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_COMMENT_TEXT;
}
