import { tokenExpiresAt } from '@/api/token';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { authRequest, isSession, type Session } from '@/api/auth';

const storageKey = 'homehub-session';
type AuthState = {
  session: Session | null;
  ready: boolean;
  restoreSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

// Native sessions use encrypted storage. Web sessions stay in memory only.
export const useAuthStore = create<AuthState>((set) => ({
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
    if (!isSession(data) || tokenExpiresAt(data.token) <= Date.now()) throw new Error('Unexpected login response. Please try again.');
    const session = { token: data.token, user: data.user };
    if (Platform.OS !== 'web') {
      try { await SecureStore.setItemAsync(storageKey, JSON.stringify(session)); }
      catch { throw new Error('Could not save your session. Please try again.'); }
    }
    set({ session });
  },
  logout: async () => {
    if (Platform.OS !== 'web') {
      try { await SecureStore.deleteItemAsync(storageKey); }
      catch { throw new Error('Could not clear your saved session. Please try again.'); }
    }
    set({ session: null });
  },
}));

