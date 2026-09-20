import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Icon, Surface, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import ThemeMenu from '@/components/theme-menu';
import { fonts } from '@/constants/fonts';

export default function AuthShell({ children, title, subtitle }: PropsWithChildren<{ title: string; subtitle: string }>) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.container}>
            <View style={styles.brandRow}>
              <View style={styles.brandIdentity}>
                <View style={[styles.brandIcon, { backgroundColor: colors.primaryContainer }]}><Icon source="home-heart" size={24} color={colors.onPrimaryContainer} /></View>
                <Text variant="titleMedium" style={[styles.brand, { color: colors.primary }]}>HomeHub</Text>
              </View>
              <ThemeMenu />
            </View>
            <View style={[styles.hero, { backgroundColor: colors.primaryContainer }]}>
              <Text variant="labelMedium" style={[styles.eyebrow, { color: colors.onPrimaryContainer }]}>YOUR HOME, TOGETHER</Text>
              <Text variant="displaySmall" style={[styles.heading, { color: colors.onPrimaryContainer }]}>A little more together.</Text>
              <Text variant="bodyLarge" style={[styles.tagline, { color: colors.onPrimaryContainer }]}>One place for the people you call home.</Text>
              <View style={styles.features}>
                {([{ icon: 'account-group-outline', label: 'People' }, { icon: 'format-list-checks', label: 'Tasks' }, { icon: 'cash-multiple', label: 'Expenses' }]).map(({ icon, label }) => (
                  <View key={label} style={[styles.feature, { backgroundColor: colors.background }]}>
                    <Icon source={icon} size={18} color={colors.primary} />
                    <Text variant="labelMedium" style={{ color: colors.onBackground }}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>
            <Surface elevation={0} style={[styles.card, { backgroundColor: colors.elevation.level1, borderColor: colors.surfaceVariant }]}>
              <Text variant="headlineSmall" style={styles.heading} accessibilityRole="header">{title}</Text>
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
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20, paddingBottom: 32 },
  container: { width: '100%', maxWidth: 460, alignSelf: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  brandIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  brand: { fontFamily: fonts.bold, letterSpacing: 0.3 },
  hero: { padding: 24, borderRadius: 28, gap: 12, marginBottom: 20 },
  eyebrow: { letterSpacing: 1.8 },
  heading: { fontFamily: fonts.bold },
  tagline: { lineHeight: 25 },
  features: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12 },
  card: { padding: 24, borderRadius: 28, borderWidth: 1, gap: 16 },
  subtitle: { marginTop: -8, marginBottom: 4 },
});
