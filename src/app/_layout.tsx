import { useEffect } from 'react';
import { Stack, ThemeProvider } from 'expo-router';
import { AppState, useColorScheme, View } from 'react-native';
import { tokenExpiresAt } from '@/api/token';
import { ActivityIndicator, PaperProvider } from 'react-native-paper';
import { Provider as ReduxProvider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { fontAssets } from '@/constants/fonts';
import * as SystemUI from 'expo-system-ui';
import { darkTheme, lightTheme, navigationDarkTheme, navigationLightTheme } from '@/constants/app-theme';
import { resolveDark } from '@/lib/color-scheme';
import { store } from '@/redux/store';
import { useAuthStore } from '@/stores/auth-store';
import { useThemeStore } from '@/stores/theme-store';

export default function RootLayout() {
  const session = useAuthStore((state) => state.session);
  const ready = useAuthStore((state) => state.ready);
  const restoreSession = useAuthStore((state) => state.restoreSession);
  const preference = useThemeStore((state) => state.preference);
  const themeReady = useThemeStore((state) => state.ready);
  const restoreTheme = useThemeStore((state) => state.restore);
  // A load error still lets the app start. Text then falls back to the system font.
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const fontsReady = fontsLoaded || !!fontError;
  const deviceScheme = useColorScheme();
  const dark = resolveDark(preference, deviceScheme);
  const theme = dark ? darkTheme : lightTheme;
  useEffect(() => { void restoreSession(); void restoreTheme(); }, [restoreSession, restoreTheme]);

  // Paints the window behind every screen so rotation and keyboard gaps match the theme.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.background).catch(() => {});
  }, [theme]);

  useEffect(() => {
    if (!session) return;
    const expireSession = () => {
      if (tokenExpiresAt(session.token) <= Date.now()) {
        useAuthStore.setState({ session: null });
      }
    };
    const timer = setTimeout(expireSession, Math.max(0, tokenExpiresAt(session.token) - Date.now()));
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') expireSession();
    });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [session]);

  return (
    <ReduxProvider store={store}>
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <ThemeProvider value={dark ? navigationDarkTheme : navigationLightTheme}>
            <StatusBar style={dark ? 'light' : 'dark'} />
            {!ready || !themeReady || !fontsReady ? (
              <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.colors.background }}>
                <ActivityIndicator accessibilityLabel="Restoring session" />
              </View>
            ) : (
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Protected guard={!!session}>
                  <Stack.Screen name="(app)" />
                </Stack.Protected>
                <Stack.Protected guard={!session}>
                  <Stack.Screen name="login" />
                  <Stack.Screen name="register" />
                  <Stack.Screen name="forgot-password" />
                  <Stack.Screen name="reset-password" />
                </Stack.Protected>
                <Stack.Screen name="explore" />
              </Stack>
            )}
          </ThemeProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </ReduxProvider>
  );
}

