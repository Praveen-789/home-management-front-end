import { unregisterPush } from '@/lib/push-registration';
import { tokenExpiresAt } from '@/api/token';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { authRequest, googleSignIn, isSession, SESSION_STORAGE_KEY as storageKey, type Session, type User } from '@/api/auth';
import { uploadWithTicket, type ImageFile } from '@/api/images';
import * as profileApi from '@/api/profile';

type AuthState = {
  session: Session | null;
  ready: boolean;
  restoreSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  // Replaces the signed-in user's details, in memory and in the saved session.
  updateUser: (user: User) => Promise<void>;
  // Fetches the profile again, so a picture set on another phone shows up here too.
  refreshProfile: () => Promise<void>;
  changeAvatar: (file: ImageFile) => Promise<void>;
  removeAvatar: () => Promise<void>;
};

const SIGNED_OUT = 'Your session has expired. Please sign in again.';

// Native sessions use encrypted storage. Web sessions stay in memory only.
export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  ready: false,
  restoreSession: async () => {
    try {
      if (Platform.OS !== 'web') {
        const saved = await SecureStore.getItemAsync(storageKey);
        const session: unknown = saved ? JSON.parse(saved) : null;
        if (isSession(session) && tokenExpiresAt(session.token) > Date.now()) {
          set({ session });
          // Not awaited: the app opens with the saved details and corrects them when the answer arrives.
          void get().refreshProfile().catch(() => {});
        } else if (saved) await SecureStore.deleteItemAsync(storageKey);
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
  updateUser: async (user) => {
    const session = get().session;
    // A late answer must not bring back someone who has signed out or been replaced meanwhile.
    if (!session || session.user.id !== user.id) return;
    const next = { token: session.token, user };
    set({ session: next });
    // The token is untouched, so nothing that watches the session for a sign-in or sign-out reacts.
    if (Platform.OS !== 'web') await SecureStore.setItemAsync(storageKey, JSON.stringify(next)).catch(() => {});
  },
  refreshProfile: async () => {
    const token = get().session?.token;
    if (token) await get().updateUser(await profileApi.getProfile(token));
  },
  // Three steps: HomeHub signs an upload, the file goes straight to Cloudinary, then HomeHub is told
  // which file to use. The answer is the updated user, which replaces the saved one.
  changeAvatar: async (file) => {
    const token = get().session?.token;
    if (!token) throw new Error(SIGNED_OUT);
    const uploaded = await uploadWithTicket(token, profileApi.AVATAR_UPLOADS_PATH, file);
    await get().updateUser(await profileApi.setAvatar(token, uploaded.publicId));
  },
  removeAvatar: async () => {
    const token = get().session?.token;
    if (!token) throw new Error(SIGNED_OUT);
    await get().updateUser(await profileApi.removeAvatar(token));
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
