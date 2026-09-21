import { unregisterPush } from '@/lib/push-registration';
import { tokenExpiresAt } from '@/api/token';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { authRequest, googleSignIn, isSession, SESSION_STORAGE_KEY as storageKey, type Session } from '@/api/auth';

type AuthState = {
  session: Session | null;
  ready: boolean;
  restoreSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
};

// Native sessions use encrypted storage. Web sessions stay in memory only.
export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  ready: false,
  restoreSession: async () => {
    try {
      if (Platform.OS !== 'web') {
        const saved = await SecureStore.getItemAsync(storageKey);
        const session: unknown = saved ? JSON.parse(saved) : null;
        if (isSession(session) && tokenExpiresAt(session.token) > Date.now()) set({ session });
        else if (saved) await SecureStore.deleteItemAsync(storageKey);
      }
    } catch {
      // Storage failures should not trap the user on the loading screen.
      set({ session: null });
    } finally {
      set({ ready: true });
    }
  },
  login: async (email, password) => {
    const data: unknown = await authRequest('login', { email, password });
    const session = await saveSession(data);
    set({ session });
  },
  loginWithGoogle: async (idToken) => {
    const data = await googleSignIn(idToken);
    const session = await saveSession(data);
    set({ session });
  },
  logout: async () => {
    const token = get().session?.token;
    if (token) await unregisterPush(token);
    if (Platform.OS !== 'web') {
      try { await SecureStore.deleteItemAsync(storageKey); }
      catch { throw new Error('Could not clear your saved session. Please try again.'); }
    }
    set({ session: null });
  },
}));


// Both login methods validate and persist the same HomeHub session.
async function saveSession(data: unknown): Promise<Session> {
  if (!isSession(data) || tokenExpiresAt(data.token) <= Date.now()) throw new Error('Unexpected login response. Please try again.');
  const session = { token: data.token, user: data.user };
  if (Platform.OS !== 'web') {
    try { await SecureStore.setItemAsync(storageKey, JSON.stringify(session)); }
    catch { throw new Error('Could not save your session. Please try again.'); }
  }
  return session;
}
