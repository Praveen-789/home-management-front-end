// Expo Router ships its own copy of React Navigation, so the base themes come from it.
import { DarkTheme as NavigationDark, DefaultTheme as NavigationLight } from 'expo-router';
import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

// HomeHub's two Material 3 palettes. Dark mode gets its own values rather than inverted ones:
// a lighter green that stays readable on dark surfaces, a near-black green ground, and
// surfaces that step up in brightness with elevation so cards and menus separate cleanly.
const roundness = 12;

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  roundness,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#28634E',
    onPrimary: '#FFFFFF',
    primaryContainer: '#B7F0D2',
    onPrimaryContainer: '#06281B',
    secondary: '#53645B',
    background: '#F4F7F3',
    onBackground: '#183D30',
    surface: '#FFFFFF',
    onSurface: '#183D30',
    surfaceVariant: '#E3EAE5',
    onSurfaceVariant: '#53645B',
    outline: '#7A8880',
    elevation: {
      level0: 'transparent',
      level1: '#FFFFFF',
      level2: '#FFFFFF',
      level3: '#F7FAF8',
      level4: '#F3F7F4',
      level5: '#EFF4F0',
    },
  },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  roundness,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#8FD3B4',
    onPrimary: '#063826',
    primaryContainer: '#1F5140',
    onPrimaryContainer: '#B7F0D2',
    secondary: '#A9B8AF',
    background: '#0F1512',
    onBackground: '#E3EAE5',
    surface: '#161D19',
    onSurface: '#E3EAE5',
    surfaceVariant: '#26312B',
    onSurfaceVariant: '#A9B8AF',
    outline: '#5E6B64',
    elevation: {
      level0: 'transparent',
      level1: '#1A221E',
      level2: '#1E2823',
      level3: '#222D27',
      level4: '#243029',
      level5: '#27342D',
    },
  },
};

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
