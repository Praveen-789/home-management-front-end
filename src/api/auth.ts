import { apiRequest, GENERIC_ERROR, isApiError } from '@/api/client';

export { API_URL } from '@/api/client';

export type User = { id: string; name: string; email: string };
export type Session = { token: string; user: User };

// Registration currently exposes backend errors; only show known messages.
const knownMessages = ['User already exists', 'Invalid email or password'];

export async function authRequest(path: string, body: object) {
  try {
    return await apiRequest(`/auth/${path}`, { method: 'POST', body });
  } catch (error) {
    if (isApiError(error)) throw new Error(knownMessages.includes(error.message) ? error.message : GENERIC_ERROR);
    throw error;
  }
}

export function isSession(value: unknown): value is Session {
  const session = value as Session | null;
  return !!session && typeof session.token === 'string' && !!session.token &&
    typeof session.user?.id === 'string' && typeof session.user?.name === 'string' &&
    typeof session.user?.email === 'string';
}
