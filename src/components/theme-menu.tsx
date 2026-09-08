import { useState } from 'react';
import { IconButton, Menu } from 'react-native-paper';
import { THEME_PREFERENCE_LABELS, THEME_PREFERENCES, type ThemePreference } from '@/lib/color-scheme';
import { useThemeStore } from '@/stores/theme-store';

const icons: Record<ThemePreference, string> = {
  system: 'cellphone',
  light: 'white-balance-sunny',
  dark: 'weather-night',
};

// Icon button that opens the appearance picker. Works inside an Appbar or on its own.
export default function ThemeMenu() {
  const [open, setOpen] = useState(false);
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);

  return (
    <Menu
      visible={open}
      onDismiss={() => setOpen(false)}
      anchor={<IconButton icon="theme-light-dark" accessibilityLabel="Change appearance" onPress={() => setOpen(true)} />}>
      {THEME_PREFERENCES.map((option) => (
        <Menu.Item
          key={option}
          title={THEME_PREFERENCE_LABELS[option]}
          leadingIcon={icons[option]}
          trailingIcon={option === preference ? 'check' : undefined}
          accessibilityState={{ selected: option === preference }}
          onPress={() => { setOpen(false); void setPreference(option); }}
        />
      ))}
    </Menu>
  );
}
