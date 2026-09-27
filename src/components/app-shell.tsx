import type { PropsWithChildren, ReactNode } from 'react';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import BottomTabBar from '@/components/bottom-tab-bar';
import { useHeaderColors } from '@/hooks/use-header-colors';
import { fonts } from '@/constants/fonts';

type Props = PropsWithChildren<{
  title: string;
  compact?: boolean;
  // Shows the bottom tab bar. For the five top-level screens; deeper ones use `back` instead.
  tabs?: boolean;
  // Shows a back button. With no history (a deep link) it returns to the household list instead.
  back?: boolean;
  // Replaces the back button with a close button, for a temporary mode such as selecting
  // rows. Closing leaves the mode, not the screen.
  onClose?: () => void;
  actions?: ReactNode;
  // Wraps children in a keyboard-aware scroll view for forms. Lists manage their own scrolling.
  scroll?: boolean;
}>;

export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

// Layout for signed-in screens: a header bar plus a full-height body. The header handles the
// status bar inset itself, so the safe area only covers the other edges.
export default function AppShell({ title, compact, tabs, back, onClose, actions, scroll, children }: Props) {
  const { colors } = useTheme();
  const header = useHeaderColors();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['bottom', 'left', 'right']}>
      {/* The header is dark in both themes, so the clock and battery icons must be light. */}
      <StatusBar style="light" />
      <Appbar.Header mode={compact ? "small" : undefined} style={[{ backgroundColor: header.background }, compact && { height: 48 }]}>
        {onClose && <Appbar.Action icon="close" color={header.foreground} accessibilityLabel="Cancel selection" onPress={onClose} />}
        {!onClose && back && <Appbar.BackAction onPress={goBack} color={header.foreground} accessibilityLabel="Go back" />}
        <Appbar.Content title={title} titleStyle={[styles.title, { color: header.foreground }]} />
        {actions}
      </Appbar.Header>
      {scroll ? (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.form}>{children}</View>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.flex}>{children}</View>
      )}
      {tabs && <BottomTabBar />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  title: { fontFamily: fonts.bold },
  scroll: { flexGrow: 1, padding: 24 },
  form: { width: '100%', maxWidth: 460, alignSelf: 'center', gap: 16 },
});
