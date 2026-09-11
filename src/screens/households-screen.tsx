import usePushOnce from '@/hooks/use-push-once';
import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Button, Card, Dialog, FAB, HelperText, Icon, Portal, Snackbar, Text, useTheme } from 'react-native-paper';
import type { Household } from '@/api/households';
import AppShell from '@/components/app-shell';
import StatusMessage from '@/components/status-message';
import ThemeMenu from '@/components/theme-menu';
import { errorMessage } from '@/lib/errors';
import { ROLE_LABELS } from '@/lib/household-permissions';
import { useAuthStore } from '@/stores/auth-store';
import { useHouseholdStore } from '@/stores/household-store';

const LOAD_ERROR = 'Could not load your households.';


export default function HouseholdsScreen() {
  const { push, navigating } = usePushOnce();
  const openCreate = () => push('/households/create');
  const { colors } = useTheme();
  const name = useAuthStore((state) => state.session?.user.name);
  const logout = useAuthStore((state) => state.logout);
  const households = useHouseholdStore((state) => state.households);
  const loadHouseholds = useHouseholdStore((state) => state.loadHouseholds);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [signOutError, setSignOutError] = useState('');
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  useEffect(() => {
    loadHouseholds().catch((error: unknown) => setError(errorMessage(error, LOAD_ERROR)));
  }, [loadHouseholds]);

  async function refresh() {
    setRefreshing(true);
    setError('');
    try { await loadHouseholds(); }
    catch (error) { setError(errorMessage(error, LOAD_ERROR)); }
    finally { setRefreshing(false); }
  }

  // Runs once the user confirms in the dialog below.
  async function signOut() {
    setConfirmingSignOut(false);
    setSignOutError('');
    try { await logout(); }
    catch (error) { setSignOutError(errorMessage(error)); }
  }

  return (
    <AppShell title="Your households" actions={<><ThemeMenu /><Appbar.Action icon="logout" accessibilityLabel="Sign out" onPress={() => setConfirmingSignOut(true)} /></>}>
      {households === null ? (
        error
          ? <StatusMessage text={error} action="Try again" onAction={refresh} loading={refreshing} />
          : <ActivityIndicator style={styles.center} accessibilityLabel="Loading households" />
      ) : households.length === 0 ? (
        error
          ? <StatusMessage text={error} action="Try again" onAction={refresh} loading={refreshing} />
          : <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.primaryContainer }]}><Icon source="home-heart" size={48} color={colors.onPrimaryContainer} /></View>
              <Text variant="headlineSmall" style={styles.heading}>A home for your household</Text>
              <Text variant="bodyLarge" style={[styles.emptyCopy, { color: colors.onSurfaceVariant }]}>Bring your people, everyday tasks, and shared expenses together in one place.</Text>
              <Button mode="contained" icon="plus" disabled={navigating} onPress={openCreate} contentStyle={styles.createButton}>Create a household</Button>
            </View>
      ) : (
        <FlatList
          data={households}
          keyExtractor={(household) => household.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={[styles.hero, { backgroundColor: colors.primaryContainer }]}>
                <View style={styles.heroTop}>
                  <Text variant="labelMedium" style={[styles.eyebrow, { color: colors.onPrimaryContainer }]}>HOME, TOGETHER</Text>
                  <Icon source="home-heart" size={32} color={colors.onPrimaryContainer} />
                </View>
                <Text variant="headlineMedium" style={[styles.heading, { color: colors.onPrimaryContainer }]}>Welcome{name?.trim() ? `, ${name.trim().split(/\s+/)[0]}` : ' home'}.</Text>
                <Text variant="bodyLarge" style={{ color: colors.onPrimaryContainer }}>A little less to manage. More room for living.</Text>
              </View>
              <View style={styles.sectionHeading}>
                <Text variant="titleLarge" style={styles.heading}>Your households</Text>
                <View style={[styles.count, { backgroundColor: colors.surfaceVariant }]}><Text variant="labelLarge">{households.length}</Text></View>
              </View>
              <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>Choose a home to see what’s happening.</Text>
              {!!error && <HelperText type="error" accessibilityLiveRegion="polite">{error}</HelperText>}
            </View>
          }
          renderItem={({ item }) => <HouseholdCard household={item} disabled={navigating} onPress={() => push({ pathname: '/households/[householdId]', params: { householdId: item.id } })} />}
        />
      )}
      {households !== null && households.length > 0 && (
        <FAB icon="plus" label="New household" style={styles.fab} disabled={navigating} onPress={openCreate} />
      )}
      <Portal>
        <Dialog visible={confirmingSignOut} onDismiss={() => setConfirmingSignOut(false)}>
          <Dialog.Title>Sign out?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">You will need to sign in again to see your households.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmingSignOut(false)}>Cancel</Button>
            <Button onPress={signOut}>Sign out</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Snackbar visible={!!signOutError} onDismiss={() => setSignOutError('')}>{signOutError}</Snackbar>
    </AppShell>
  );
}

function HouseholdCard({ household, disabled, onPress }: { household: Household; disabled: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const label = ROLE_LABELS[household.role];
  return (
    <Card
      mode="contained"
      style={[styles.card, disabled && { opacity: 0.6 }, { backgroundColor: colors.elevation.level1, borderColor: colors.surfaceVariant }]}
      accessibilityLabel={`${household.name}, ${label}`}
      onPress={onPress} disabled={disabled}>
      <View style={styles.cardContent}>
        <View style={styles.heroTop}>
          <View style={[styles.homeIcon, { backgroundColor: colors.primaryContainer }]}><Icon source="home-outline" size={28} color={colors.onPrimaryContainer} /></View>
          <View style={[styles.role, { backgroundColor: colors.surfaceVariant }]}><Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>{label}</Text></View>
        </View>
        <Text variant="titleLarge" style={styles.heading}>{household.name}</Text>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>Created {new Date(household.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
        <View style={[styles.cardFooter, { borderTopColor: colors.surfaceVariant }]}>
          <Text variant="labelLarge" style={{ color: colors.primary }}>Open household</Text>
          <Icon source="arrow-right" size={20} color={colors.primary} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  list: { padding: 20, paddingBottom: 112, gap: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { gap: 8, marginBottom: 4 },
  hero: { padding: 24, borderRadius: 28, gap: 12, marginBottom: 20 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  eyebrow: { letterSpacing: 1.8, flexShrink: 1 },
  heading: { fontWeight: '700' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  count: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  card: { borderRadius: 24, borderWidth: 1 },
  cardContent: { padding: 20, gap: 8 },
  homeIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  role: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, marginTop: 10, paddingTop: 16 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 20, maxWidth: 460, alignSelf: 'center' },
  emptyIcon: { padding: 26, borderRadius: 32 },
  emptyCopy: { textAlign: 'center', lineHeight: 26 },
  createButton: { paddingVertical: 6 },
  fab: { position: 'absolute', right: 20, bottom: 20, borderRadius: 20 },
});
