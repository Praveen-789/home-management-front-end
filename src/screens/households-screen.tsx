import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Card, Chip, FAB, HelperText, Snackbar, Text, useTheme } from 'react-native-paper';
import type { Household } from '@/api/households';
import AppShell from '@/components/app-shell';
import StatusMessage from '@/components/status-message';
import ThemeMenu from '@/components/theme-menu';
import { errorMessage } from '@/lib/errors';
import { ROLE_LABELS } from '@/lib/household-permissions';
import { useAuthStore } from '@/stores/auth-store';
import { useHouseholdStore } from '@/stores/household-store';

const LOAD_ERROR = 'Could not load your households.';
const openCreate = () => router.push('/households/create');

export default function HouseholdsScreen() {
  const { colors } = useTheme();
  const name = useAuthStore((state) => state.session?.user.name);
  const logout = useAuthStore((state) => state.logout);
  const households = useHouseholdStore((state) => state.households);
  const loadHouseholds = useHouseholdStore((state) => state.loadHouseholds);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [signOutError, setSignOutError] = useState('');

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

  async function signOut() {
    setSignOutError('');
    try { await logout(); }
    catch (error) { setSignOutError(errorMessage(error)); }
  }

  return (
    <AppShell title="Your households" actions={<><ThemeMenu /><Appbar.Action icon="logout" accessibilityLabel="Sign out" onPress={signOut} /></>}>
      {households === null ? (
        error
          ? <StatusMessage text={error} action="Try again" onAction={refresh} loading={refreshing} />
          : <ActivityIndicator style={styles.center} accessibilityLabel="Loading households" />
      ) : households.length === 0 ? (
        error
          ? <StatusMessage text={error} action="Try again" onAction={refresh} loading={refreshing} />
          : <StatusMessage text="You are not part of a household yet. Create one to start sharing your home." action="Create a household" onAction={openCreate} />
      ) : (
        <FlatList
          data={households}
          keyExtractor={(household) => household.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>Signed in as {name}</Text>
              {!!error && <HelperText type="error" accessibilityLiveRegion="polite">{error}</HelperText>}
            </View>
          }
          renderItem={({ item }) => <HouseholdCard household={item} />}
        />
      )}
      {households !== null && households.length > 0 && (
        <FAB icon="plus" label="New household" style={styles.fab} onPress={openCreate} />
      )}
      <Snackbar visible={!!signOutError} onDismiss={() => setSignOutError('')}>{signOutError}</Snackbar>
    </AppShell>
  );
}

function HouseholdCard({ household }: { household: Household }) {
  const { colors } = useTheme();
  const label = ROLE_LABELS[household.role];
  return (
    <Card
      mode="contained"
      style={{ backgroundColor: colors.elevation.level1 }}
      accessibilityLabel={`${household.name}, ${label}`}
      onPress={() => router.push({ pathname: '/households/[householdId]', params: { householdId: household.id } })}>
      <Card.Title
        title={household.name}
        titleVariant="titleMedium"
        subtitle={`Created ${new Date(household.createdAt).toLocaleDateString()}`}
        right={() => <Chip compact>{label}</Chip>}
        rightStyle={styles.cardRight}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 96, gap: 12, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { marginBottom: 4 },
  cardRight: { marginRight: 16 },
  fab: { position: 'absolute', right: 16, bottom: 16 },
});
