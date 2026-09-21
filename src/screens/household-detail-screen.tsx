import usePushOnce from '@/hooks/use-push-once';
import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { RefreshControl, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { ActivityIndicator, Card, FAB, HelperText, Icon, Snackbar, Text, useTheme } from 'react-native-paper';
import HeaderAction from '@/components/header-action';
import AppDialog from '@/components/ui/app-dialog';
import type { Member } from '@/api/households';
import AppShell from '@/components/app-shell';
import MemberRow from '@/components/member-row';
import NotificationBell from '@/components/notification-bell';
import PendingInvitationRow from '@/components/pending-invitation-row';
import StatusMessage from '@/components/status-message';
import { errorMessage } from '@/lib/errors';
import { canManageMember, canManageMembers, ROLE_LABELS, type AssignableRole } from '@/lib/household-permissions';
import { useAuthStore } from '@/stores/auth-store';
import { useHouseholdStore } from '@/stores/household-store';
import { useInvitationStore } from '@/stores/invitation-store';
import { fonts } from '@/constants/fonts';
import { rowExit, rowShift } from '@/constants/motion';

const LOAD_ERROR = 'Could not load this household.';
const heroEnter = FadeInDown.duration(280).reduceMotion(ReduceMotion.System);
const featuresEnter = FadeInDown.duration(280).delay(80).reduceMotion(ReduceMotion.System);
const rowEnter = FadeIn.duration(220).reduceMotion(ReduceMotion.System);

export default function HouseholdDetailScreen() {
  const { push, navigating } = usePushOnce();
  const { householdId = '' } = useLocalSearchParams<{ householdId: string }>();
  const theme = useTheme();
  const userId = useAuthStore((state) => state.session?.user.id);
  const households = useHouseholdStore((state) => state.households);
  const members = useHouseholdStore((state) => state.membersByHousehold[householdId]);
  const updateMemberRole = useHouseholdStore((state) => state.updateMemberRole);
  const removeMember = useHouseholdStore((state) => state.removeMember);
  const invitations = useInvitationStore((state) => state.sentByHousehold[householdId]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [removal, setRemoval] = useState<Member | null>(null);

  const household = households?.find((item) => item.id === householdId);
  const role = household?.role;
  const openTasks = () => push({ pathname: '/households/[householdId]/tasks', params: { householdId } });
  const openExpenses = () => push({ pathname: '/households/[householdId]/expenses', params: { householdId } });

  useEffect(() => {
    // A deep link can arrive before the list is loaded, and the list is what carries the caller's role.
    const { households, loadHouseholds, loadMembers } = useHouseholdStore.getState();
    const load = households === null ? loadHouseholds().then(() => loadMembers(householdId)) : loadMembers(householdId);
    load.catch((error: unknown) => setError(errorMessage(error, LOAD_ERROR)));
    // Pending invitations are an extra; a failure only hides the section until the next refresh.
    useInvitationStore.getState().loadSent(householdId).catch(() => {});
  }, [householdId]);

  async function refresh() {
    setRefreshing(true);
    setError('');
    try {
      const { loadHouseholds, loadMembers } = useHouseholdStore.getState();
      await Promise.all([loadHouseholds(), loadMembers(householdId), useInvitationStore.getState().loadSent(householdId)]);
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

  function cancelInvitation(invitationId: string, name: string) {
    void run(() => useInvitationStore.getState().cancel(householdId, invitationId), `The invitation for ${name} was cancelled.`);
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
    <AppShell
      title={household?.name ?? 'Household'}
      back
      actions={
        <>
          <NotificationBell disabled={navigating} onPress={() => push('/notifications')} />
          <HeaderAction icon="format-list-checks" accessibilityLabel="Tasks" disabled={navigating} onPress={openTasks} />
          <HeaderAction icon="cash-multiple" accessibilityLabel="Expenses" disabled={navigating} onPress={openExpenses} />
        </>
      }>
      {!members ? (
        error
          ? <StatusMessage text={error} action="Try again" onAction={refresh} loading={refreshing} />
          : <ActivityIndicator style={styles.center} accessibilityLabel="Loading members" />
      ) : (
        <Animated.FlatList
          itemLayoutAnimation={rowShift}
          skipEnteringExitingAnimations
          data={members}
          keyExtractor={(member) => member.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListHeaderComponent={
            <View style={styles.header}>
              <Animated.View entering={heroEnter} style={[styles.hero, { backgroundColor: theme.colors.primaryContainer }]}>
                <View style={styles.heroTop}>
                  <Icon source="home-heart" size={36} color={theme.colors.onPrimaryContainer} />
                  {role && <View style={[styles.role, { backgroundColor: theme.colors.background }]}><Text variant="labelMedium" style={{ color: theme.colors.primary }}>Your role: {ROLE_LABELS[role]}</Text></View>}
                </View>
                <Text variant="headlineMedium" style={[styles.heading, { color: theme.colors.onPrimaryContainer }]}>{household?.name ?? 'Your household'}</Text>
                <Text variant="bodyLarge" style={{ color: theme.colors.onPrimaryContainer }}>Your shared space for everyday life.</Text>
                <View style={styles.memberCount}>
                  <Icon source="account-group-outline" size={20} color={theme.colors.onPrimaryContainer} />
                  <Text variant="labelLarge" style={{ color: theme.colors.onPrimaryContainer }}>{members.length} {members.length === 1 ? 'member' : 'members'} at home</Text>
                </View>
              </Animated.View>
              <Text variant="titleLarge" style={styles.heading}>Around the house</Text>
              <Animated.View entering={featuresEnter} style={styles.features}>
                <Card mode="contained" style={[styles.feature, { backgroundColor: theme.colors.elevation.level1, borderColor: theme.colors.surfaceVariant }]} disabled={navigating} onPress={openTasks} accessibilityLabel="Open tasks">
                  <View style={styles.featureContent}>
                    <Icon source="format-list-checks" size={28} color={theme.colors.primary} />
                    <Text variant="titleMedium" style={styles.heading}>Tasks</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Share the to-dos</Text>
                    <Icon source="arrow-right" size={20} color={theme.colors.primary} />
                  </View>
                </Card>
                <Card mode="contained" style={[styles.feature, { backgroundColor: theme.colors.elevation.level1, borderColor: theme.colors.surfaceVariant }]} disabled={navigating} onPress={openExpenses} accessibilityLabel="Open expenses">
                  <View style={styles.featureContent}>
                    <Icon source="cash-multiple" size={28} color={theme.colors.primary} />
                    <Text variant="titleMedium" style={styles.heading}>Expenses</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Keep costs in check</Text>
                    <Icon source="arrow-right" size={20} color={theme.colors.primary} />
                  </View>
                </Card>
              </Animated.View>
              <Card mode="contained" style={{ borderRadius: 22, backgroundColor: theme.colors.primaryContainer }} disabled={navigating}
                onPress={() => push({ pathname: '/chats', params: { householdId } })} accessibilityLabel="Open household chats">
                <View style={[styles.featureContent, { flexDirection: 'row', alignItems: 'center', gap: 16 }]}>
                  <Icon source="chat-outline" size={30} color={theme.colors.primary} />
                  <View style={{ flex: 1, gap: 4 }}><Text variant="titleMedium" style={styles.heading}>Chats</Text>
                    <Text variant="bodyMedium">Catch up together, or talk one to one.</Text></View>
                  <Icon source="arrow-right" size={22} color={theme.colors.primary} />
                </View>
              </Card>
              <View style={styles.sectionHeading}>
                <Text variant="titleLarge" style={styles.heading}>The people at home</Text>
                <View style={[styles.count, { backgroundColor: theme.colors.surfaceVariant }]}><Text variant="labelLarge">{members.length}</Text></View>
              </View>
              {!!error && <HelperText type="error" accessibilityLiveRegion="polite">{error}</HelperText>}
            </View>
          }
          ListFooterComponent={invitations?.length ? (
            <Animated.View entering={rowEnter} exiting={rowExit} layout={rowShift} style={styles.pending}>
              <View style={styles.sectionHeading}>
                <Text variant="titleLarge" style={styles.heading}>Waiting for an answer</Text>
                <View style={[styles.count, { backgroundColor: theme.colors.surfaceVariant }]}><Text variant="labelLarge">{invitations.length}</Text></View>
              </View>
              {invitations.map((invitation) => (
                <Animated.View key={invitation.id} entering={rowEnter} exiting={rowExit} layout={rowShift} style={[styles.memberCard, { backgroundColor: theme.colors.elevation.level1, borderColor: theme.colors.surfaceVariant }]}><PendingInvitationRow
                  invitation={invitation}
                  canCancel={!!role && canManageMember(role, invitation.role)}
                  disabled={busy || navigating}
                  onCancel={() => cancelInvitation(invitation.id, invitation.invitedUser.name)}
                /></Animated.View>
              ))}
            </Animated.View>
          ) : null}
          renderItem={({ item }) => (
            <Animated.View entering={rowEnter} exiting={rowExit} style={[styles.memberCard, { backgroundColor: theme.colors.elevation.level1, borderColor: theme.colors.surfaceVariant }]}><MemberRow
              member={item}
              actorRole={role}
              isSelf={item.user.id === userId}
              disabled={busy || navigating}
              onChangeRole={(newRole) => changeRole(item, newRole)}
              onRemove={() => setRemoval(item)}
            /></Animated.View>
          )}
        />
      )}
      {role && canManageMembers(role) && (
        <FAB
          icon="account-plus"
          label="Invite member"
          style={styles.fab}
          disabled={busy || navigating}
          onPress={() => push({ pathname: '/households/[householdId]/add-member', params: { householdId } })}
        />
      )}
      <AppDialog
        visible={!!removal}
        onDismiss={() => setRemoval(null)}
        icon="account-remove-outline"
        tone="danger"
        title={`Remove ${removal?.user.name ?? 'this member'}?`}
        confirmLabel="Remove"
        onConfirm={confirmRemoval}
      >
        {`They will lose access to ${household?.name ?? 'this household'}. Their account is not affected.`}
      </AppDialog>
      <Snackbar visible={!!notice} onDismiss={() => setNotice('')} duration={4000}>{notice}</Snackbar>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  list: { padding: 20, paddingBottom: 112, width: '100%', maxWidth: 720, alignSelf: 'center', gap: 10 },
  header: { gap: 16, marginBottom: 4 },
  hero: { padding: 24, borderRadius: 28, gap: 12, marginBottom: 8 },
  heroTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heading: { fontFamily: fonts.bold },
  role: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  memberCount: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  features: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  feature: { flex: 1, minWidth: 140, borderRadius: 22, borderWidth: 1 },
  featureContent: { padding: 20, gap: 8 },
  sectionHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 12 },
  count: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  pending: { gap: 10, marginTop: 6 },
  memberCard: { borderRadius: 20, borderWidth: 1, paddingVertical: 4 },
  fab: { position: 'absolute', right: 20, bottom: 20, borderRadius: 20 },
});
