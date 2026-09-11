import { isApiError } from '@/api/client';
import { useAuthStore } from '@/stores/auth-store';

export const SESSION_EXPIRED = 'Your session has expired. Please sign in again.';

// Runs an API call with the current token. A 401 means the backend rejected the token, so the
// session is cleared and the protected routes return the user to login. Shared by every data store.
export async function withToken<Result>(call: (token: string) => Promise<Result>): Promise<Result> {
  const session = useAuthStore.getState().session;
  if (!session) throw new Error(SESSION_EXPIRED);
  try {
    return await call(session.token);
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      useAuthStore.getState().logout().catch(() => useAuthStore.setState({ session: null }));
      throw new Error(SESSION_EXPIRED);
    }
    throw error;
  }
}
