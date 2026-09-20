// Expo Router ships its own copy of React Navigation, so the base themes come from it.
import { DarkTheme as NavigationDark, DefaultTheme as NavigationLight } from 'expo-router';
import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';
import { paperFonts } from '@/constants/fonts';

// HomeHub's two Material 3 palettes. Dark mode gets its own values rather than inverted ones:
// a lighter green that stays readable on dark surfaces, a near-black green ground, and
// surfaces that step up in brightness with elevation so cards and menus separate cleanly.
const roundness = 12;

// Every colour role is set on purpose. Roles left at Paper's defaults are lavender-grey, which
// made chips, snackbars and tonal buttons look dusty next to the green.
export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  roundness,
  fonts: paperFonts,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#28634E',
    onPrimary: '#FFFFFF',
    primaryContainer: '#B7F0D2',
    onPrimaryContainer: '#06281B',
    secondary: '#3F6354',
    onSecondary: '#FFFFFF',
    secondaryContainer: '#CFE9DB',
    onSecondaryContainer: '#0A2016',
    // A warm accent. One non-green colour keeps an all-green app from feeling flat.
    tertiary: '#A4582B',
    onTertiary: '#FFFFFF',
    tertiaryContainer: '#FFDCC7',
    onTertiaryContainer: '#3A1600',
    // The ground is a clear step darker than the white cards, so cards lift without shadows.
    background: '#E9F0EB',
    onBackground: '#183D30',
    surface: '#FFFFFF',
    onSurface: '#183D30',
    surfaceVariant: '#D5E0D9',
    onSurfaceVariant: '#45564D',
    outline: '#6F7D75',
    outlineVariant: '#C3CFC8',
    inverseSurface: '#1F2E27',
    inverseOnSurface: '#EAF2EC',
    inversePrimary: '#8FD3B4',
    elevation: {
      level0: 'transparent',
      level1: '#FFFFFF',
      level2: '#F6FAF7',
      level3: '#F1F7F3',
      level4: '#EDF4EF',
      level5: '#E8F1EB',
    },
  },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  roundness,
  fonts: paperFonts,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#7FD8AE',
    onPrimary: '#063826',
    primaryContainer: '#1F5C45',
    onPrimaryContainer: '#B7F0D2',
    secondary: '#B3CCBE',
    onSecondary: '#1F352B',
    secondaryContainer: '#2A4A3C',
    onSecondaryContainer: '#CFE9DB',
    tertiary: '#FFB68A',
    onTertiary: '#532200',
    tertiaryContainer: '#75340F',
    onTertiaryContainer: '#FFDCC7',
    background: '#0C110E',
    onBackground: '#E3EAE5',
    surface: '#141B17',
    onSurface: '#E3EAE5',
    surfaceVariant: '#2C3A32',
    onSurfaceVariant: '#B5C4BB',
    outline: '#75847B',
    outlineVariant: '#36443C',
    inverseSurface: '#E3EAE5',
    inverseOnSurface: '#1F2E27',
    inversePrimary: '#28634E',
    // Wider steps than before, so a card is visibly lighter than the ground it sits on.
    elevation: {
      level0: 'transparent',
      level1: '#19221D',
      level2: '#1E2923',
      level3: '#233029',
      level4: '#27362E',
      level5: '#2B3C33',
    },
  },
};

// The header is the one solid block of brand colour on every signed-in screen. Light mode uses
// the full primary green. Dark mode uses a deep green, because the pastel dark-mode primary
// would glare as a large area.
export const headerColors = {
  light: { background: '#28634E', foreground: '#FFFFFF' },
  dark: { background: '#143527', foreground: '#E3EAE5' },
} as const;

// Expo Router's stack paints screen backgrounds from React Navigation's theme, not Paper's.
// Deriving both from the same palette avoids light flashes between screens in dark mode.
const toNavigationTheme = (base: typeof NavigationLight, paper: MD3Theme) => ({
  ...base,
  dark: paper.dark,
  colors: {
    ...base.colors,
    primary: paper.colors.primary,
    background: paper.colors.background,
    card: paper.colors.elevation.level2,
    text: paper.colors.onSurface,
    border: paper.colors.outline,
    notification: paper.colors.error,
  },
});

export const navigationLightTheme = toNavigationTheme(NavigationLight, lightTheme);
export const navigationDarkTheme = toNavigationTheme(NavigationDark, darkTheme);
