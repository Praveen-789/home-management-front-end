// The user's appearance choice. "system" follows the device setting; the others force a mode.
export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const THEME_PREFERENCE_LABELS: Record<ThemePreference, string> = {
  system: 'Use device setting',
  light: 'Light',
  dark: 'Dark',
};

// One-word versions for tight spots, such as the side menu's three-way switch.
export const THEME_PREFERENCE_SHORT_LABELS: Record<ThemePreference, string> = {
  system: 'Device',
  light: 'Light',
  dark: 'Dark',
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference);
}

// Decides whether the dark theme applies. React Native reports "unspecified" on some platforms;
// that and a missing value both count as light.
export function resolveDark(preference: ThemePreference, deviceScheme: 'light' | 'dark' | 'unspecified' | null | undefined): boolean {
  return preference === 'system' ? deviceScheme === 'dark' : preference === 'dark';
}
