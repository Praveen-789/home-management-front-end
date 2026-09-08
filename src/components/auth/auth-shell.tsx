import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Surface, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import ThemeMenu from '@/components/theme-menu';

export default function AuthShell({ children, title, subtitle }: PropsWithChildren<{ title: string; subtitle: string }>) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.container}>
            <View style={styles.brandRow}>
              <Text variant="titleMedium" style={[styles.brand, { color: colors.primary }]}>HOMEHUB</Text>
              <ThemeMenu />
            </View>
            <Text variant="displaySmall" style={[styles.heading, { color: colors.onBackground }]}>A little more together.</Text>
            <Text variant="bodyLarge" style={[styles.tagline, { color: colors.onSurfaceVariant }]}>One place for the people you call home.</Text>
            <Surface elevation={1} style={[styles.card, { backgroundColor: colors.elevation.level1 }]}>
              <Text variant="headlineSmall" accessibilityRole="header">{title}</Text>
              <Text variant="bodyMedium" style={[styles.subtitle, { color: colors.onSurfaceVariant }]}>{subtitle}</Text>
              {children}
            </Surface>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
// Layout only; colours come from the active theme above.
const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  container: { width: '100%', maxWidth: 460, alignSelf: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  brand: { letterSpacing: 3, fontWeight: '700' },
  heading: { fontWeight: '700' },
  tagline: { marginTop: 12, marginBottom: 32 },
  card: { padding: 24, borderRadius: 24, gap: 16 },
  subtitle: { marginBottom: 4 },
});
