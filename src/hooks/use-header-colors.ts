import { useTheme } from 'react-native-paper';
import { headerColors } from '@/constants/app-theme';

// Colours for the app header and anything drawn on it. Header icons must use the foreground,
// because the theme's normal icon colour is dark green and would vanish on the green bar.
export function useHeaderColors() {
  const { dark } = useTheme();
  return dark ? headerColors.dark : headerColors.light;
}
