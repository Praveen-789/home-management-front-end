// Pure rules for the forgot-password screens. No React or network code, so Node can test them.
// The limits mirror the backend's, so the app refuses the same input the API would.

export const CODE_LENGTH = 6;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72;
export const RESEND_COOLDOWN_SECONDS = 60;

export const isEmail = (text: string): boolean => /^\S+@\S+\.\S+$/.test(text.trim());

// Keeps only digits, at most six, so a code pasted with spaces or a trailing newline still fits.
export function normalizeCode(text: string): string {
  return text.replace(/\D/g, '').slice(0, CODE_LENGTH);
}

export const isCompleteCode = (code: string): boolean => new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code);

// Why a new password cannot be used, or null when it can.
export function passwordProblem(password: string, confirmation: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  if (password !== confirmation) return 'Your passwords do not match.';
  return null;
}

// Whole seconds before another code may be requested, never below zero. `sentAt` of 0 means no
// code has been sent from this screen, so there is nothing to wait for.
export function resendWait(sentAt: number, now: number): number {
  if (!sentAt) return 0;
  return Math.max(0, Math.ceil((sentAt + RESEND_COOLDOWN_SECONDS * 1000 - now) / 1000));
}
