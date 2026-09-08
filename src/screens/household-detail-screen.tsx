import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Dialog, Divider, FAB, HelperText, Portal, Snackbar, Text, useTheme } from 'react-native-paper';
import type { Member } from '@/api/households';
import AppShell from '@/components/app-shell';
import MemberRow from '@/components/member-row';
import StatusMessage from '@/components/status-message';
import { errorMessage } from '@/lib/errors';
import { canManageMembers, ROLE_LABELS, type AssignableRole } from '@/lib/household-permissions';
import { useAuthStore } from '@/stores/auth-store';
import { useHouseholdStore } from '@/stores/household-store';

const LOAD_ERROR = 'Could not load this household.';

export default function HouseholdDetailScreen() {
  const { householdId = '' } = useLocalSearchParams<{ householdId: string }>();
  const theme = useTheme();
  const userId = useAuthStore((state) => state.session?.user.id);
  const households = useHouseholdStore((state) => state.households);
  const members = useHouseholdStore((state) => state.membersByHousehold[householdId]);
  const updateMemberRole = useHouseholdStore((state) => state.updateMemberRole);
  const removeMember = useHouseholdStore((state) => state.removeMember);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [removal, setRemoval] = useState<Member | null>(null);

  const household = households?.find((item) => item.id === householdId);
  const role = household?.role;

  useEffect(() => {
    // A deep link can arrive before the list is loaded, and the list is what carries the caller's role.
    const { households, loadHouseholds, loadMembers } = useHouseholdStore.getState();
    const load = households === null ? loadHouseholds().then(() => loadMembers(householdId)) : loadMembers(householdId);
    load.catch((error: unknown) => setError(errorMessage(error, LOAD_ERROR)));
  }, [householdId]);

  async function refresh() {
    setRefreshing(true);
    setError('');
    try {
      const { loadHouseholds, loadMembers } = useHouseholdStore.getState();
      await Promise.all([loadHouseholds(), loadMembers(householdId)]);
    } catch (error) { setError(errorMessage(error, LOAD_ERROR)); }
    finally { setRefreshing(false); }
  }

  // Member actions report through the snackbar so the list stays in place.
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try { await action(); setNotice(success); }
    catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  function changeRole(member: Member, newRole: AssignableRole) {
    void run(() => updateMemberRole(householdId, member.user.id, newRole), `${member.user.name} is now ${ROLE_LABELS[newRole].toLowerCase()}.`);
  }

  function confirmRemoval() {
    if (!removal) return;
    const member = removal;
    setRemoval(null);
    void run(() => removeMember(householdId, member.user.id), `${member.user.name} was removed.`);
  }

  if (households !== null && !household) {
    return (
      <AppShell title="Household" back>
        <StatusMessage text="This household is not available. You may have been removed from it." action="Back to households" onAction={() => router.replace('/')} />
      </AppShell>
    );
  }

  return (
    <AppShell title={household?.name ?? 'Household'} back>
      {!members ? (
        error
          ? <StatusMessage text={error} action="Try again" onAction={refresh} loading={refreshing} />
          : <ActivityIndicator style={styles.center} accessibilityLabel="Loading members" />
      ) : (
        <FlatList
          data={members}
          keyExtractor={(member) => member.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ItemSeparatorComponent={() => <Divider />}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text variant="titleMedium">Members ({members.length})</Text>
              {role && <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>Your role: {ROLE_LABELS[role]}</Text>}
              {!!error && <HelperText type="error" accessibilityLiveRegion="polite">{error}</HelperText>}
            </View>
          }
          renderItem={({ item }) => (
            <MemberRow
              member={item}
              actorRole={role}
              isSelf={item.user.id === userId}
              disabled={busy}
              onChangeRole={(newRole) => changeRole(item, newRole)}
              onRemove={() => setRemoval(item)}
            />
          )}
        />
      )}
      {role && canManageMembers(role) && (
        <FAB
          icon="account-plus"
          label="Add member"
          style={styles.fab}
          disabled={busy}
          onPress={() => router.push({ pathname: '/households/[householdId]/add-member', params: { householdId } })}
        />
      )}
      <Portal>
        <Dialog visible={!!removal} onDismiss={() => setRemoval(null)}>
          <Dialog.Title>Remove {removal?.user.name ?? 'this member'}?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">They will lose access to {household?.name ?? 'this household'}. Their account is not affected.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setRemoval(null)}>Cancel</Button>
            <Button textColor={theme.colors.error} onPress={confirmRemoval}>Remove</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Snackbar visible={!!notice} onDismiss={() => setNotice('')} duration={4000}>{notice}</Snackbar>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  list: { paddingVertical: 8, paddingBottom: 96, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { paddingHorizontal: 16, paddingVertical: 8, gap: 4 },
  fab: { position: 'absolute', right: 16, bottom: 16 },
});
