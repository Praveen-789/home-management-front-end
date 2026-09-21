import { apiRequest, GENERIC_ERROR, isApiError } from '@/api/client';

export { API_URL } from '@/api/client';

export type User = { id: string; name: string; email: string };
export type Session = { token: string; user: User };
// Where a phone keeps its session. It is shared because a notification button can wake the app with
// no screen and no store loaded, and the reply still has to be sent as the signed-in user.
export const SESSION_STORAGE_KEY = 'homehub-session';

// Registration currently exposes backend errors; only show known messages.
const knownMessages = ['User already exists', 'Invalid email or password', 'Password must be at least 8 characters'];

export async function authRequest(path: string, body: object) {
  try {
    return await apiRequest(`/auth/${path}`, { method: 'POST', body });
  } catch (error) {
    if (isApiError(error)) throw new Error(knownMessages.includes(error.message) ? error.message : GENERIC_ERROR);
    throw error;
  }
}

// The reset endpoints answer with messages meant for people, so they are shown as they are.
export async function requestPasswordReset(email: string): Promise<void> {
  await apiRequest('/auth/forgot-password', { method: 'POST', body: { email } });
}

export async function resetPassword(email: string, code: string, password: string): Promise<void> {
  await apiRequest('/auth/reset-password', { method: 'POST', body: { email, code, password } });
}

export async function googleSignIn(idToken: string) {
  return apiRequest('/auth/google', { method: 'POST', body: { idToken } });
}

export async function linkGoogleAccount(token: string, idToken: string, password: string) {
  return apiRequest('/auth/google/link', { method: 'POST', token, body: { idToken, password } });
}

export function isSession(value: unknown): value is Session {
  const session = value as Session | null;
  return !!session && typeof session.token === 'string' && !!session.token &&
    typeof session.user?.id === 'string' && typeof session.user?.name === 'string' &&
    typeof session.user?.email === 'string';
}
