import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { isThemePreference, type ThemePreference } from '@/lib/color-scheme';

const storageKey = 'homehub-theme';

type ThemeState = {
  preference: ThemePreference;
  // False until the saved preference has been read, so the first frame uses the right theme.
  ready: boolean;
  restore: () => Promise<void>;
  setPreference: (preference: ThemePreference) => Promise<void>;
};

// Native reuses the secure store the session already lives in, so no new native module and no
// dev-client rebuild is needed for a six-character setting. Web uses localStorage.
async function readSaved(): Promise<string | null> {
  if (Platform.OS === 'web') return typeof localStorage === 'undefined' ? null : localStorage.getItem(storageKey);
  return SecureStore.getItemAsync(storageKey);
}

async function save(value: ThemePreference): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, value);
    return;
  }
  await SecureStore.setItemAsync(storageKey, value);
}

export const useThemeStore = create<ThemeState>((set) => ({
  preference: 'system',
  ready: false,
  restore: async () => {
    try {
      const saved = await readSaved();
      if (isThemePreference(saved)) set({ preference: saved });
    } catch {
      // An unreadable preference just means the device setting applies.
    } finally {
      set({ ready: true });
    }
  },
  setPreference: async (preference) => {
    // Apply immediately; a failed save only means the choice lasts until the next launch.
    set({ preference });
    try { await save(preference); } catch { /* see above */ }
  },
}));
