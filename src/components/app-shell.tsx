import type { PropsWithChildren, ReactNode } from 'react';
import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = PropsWithChildren<{
  title: string;
  // Shows a back button. With no history (a deep link) it returns to the household list instead.
  back?: boolean;
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
export default function AppShell({ title, back, actions, scroll, children }: Props) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['bottom', 'left', 'right']}>
      <Appbar.Header style={{ backgroundColor: colors.background }}>
        {back && <Appbar.BackAction onPress={goBack} accessibilityLabel="Go back" />}
        <Appbar.Content title={title} titleStyle={[styles.title, { color: colors.onBackground }]} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  title: { fontWeight: '700' },
  scroll: { flexGrow: 1, padding: 24 },
  form: { width: '100%', maxWidth: 460, alignSelf: 'center', gap: 16 },
});
