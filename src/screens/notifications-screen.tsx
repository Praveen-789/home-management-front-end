import useInvitationActions from '@/hooks/use-invitation-actions';
import usePushOnce from '@/hooks/use-push-once';
import type { Notification } from '@/api/notifications';
import AppShell from '@/components/app-shell';
import NotificationRow from '@/components/notification-row';
import StatusMessage from '@/components/status-message';
import HeaderAction from '@/components/header-action';
import AppDialog from '@/components/ui/app-dialog';
import { errorMessage } from '@/lib/errors';
import { notificationTarget, type InboxFilter } from '@/lib/notification-helpers';
import { useHouseholdStore } from '@/stores/household-store';
import { INVITATION_GONE, useInvitationStore } from '@/stores/invitation-store';
import { useNotificationStore } from '@/stores/notification-store';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Chip, Divider, HelperText, Snackbar, Text } from 'react-native-paper';
import Animated from 'react-native-reanimated';
import { rowExit, rowShift } from '@/constants/motion';

const LOAD_ERROR = 'Could not load your notifications.';
const FILTERS: { value: InboxFilter; label: string }[] = [{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread' }];

// The signed-in user's inbox across every household. Tapping a row marks it read and opens the
// task, expense or household it is about; the destination screen explains a target that has since
// been deleted or a household the user has left.
export default function NotificationsScreen() {
  const { push, navigating } = usePushOnce();
  const list = useNotificationStore((state) => state.list);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const loadNotifications = useNotificationStore((state) => state.loadNotifications);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // The invitation notification whose Accept / Decline dialog is open.
  const [invitation, setInvitation] = useState<{ id: string; householdId: string; householdName?: string; message: string } | null>(null);
  const checkingInvitation = useRef(false);
  const { busyId, accept, decline } = useInvitationActions(setNotice);

  // A list fetched for the other filter is stale for this one, so treat it as not loaded yet.
  const current = list && list.filter === filter ? list : undefined;
  const notifications = current?.notifications;
  const hasMore = !!current && current.pagination.page < current.pagination.totalPages;

  // Loads the first page on every focus, so coming back from a notification's target shows any
  // that arrived meanwhile. The count is refreshed too, because an "All" page does not carry it.
  useFocusEffect(useCallback(() => {
    const { refreshUnreadCount } = useNotificationStore.getState();
    Promise.all([loadNotifications(filter), refreshUnreadCount()])
      .catch((error: unknown) => setError(errorMessage(error, LOAD_ERROR)));
  }, [loadNotifications, filter]));

  // A new filter starts a fresh load, so an error from the previous one no longer applies.
  function changeFilter(option: InboxFilter) {
    setError('');
    setFilter(option);
  }

  async function refresh() {
    setRefreshing(true);
    setError('');
    try { await Promise.all([loadNotifications(filter), useNotificationStore.getState().refreshUnreadCount()]); }
    catch (error) { setError(errorMessage(error, LOAD_ERROR)); }
    finally { setRefreshing(false); }
  }

  // Called by the list when the user nears the end. Fetches the next page while one remains.
  async function loadMore() {
    if (!current || !hasMore || loadingMore || refreshing) return;
    setLoadingMore(true);
    try { await loadNotifications(filter, current.pagination.page + 1); }
    catch (error) { setNotice(errorMessage(error, 'Could not load more notifications.')); }
    finally { setLoadingMore(false); }
  }

  async function open(notification: Notification) {
    if (!notification.isRead) {
      useNotificationStore.getState().markRead(notification.id)
        .catch((error: unknown) => setNotice(errorMessage(error, 'Could not mark the notification as read.')));
    }
    const target = notificationTarget(notification);
    if (!target) return;
    if (target.kind === 'invitation') {
      // The notification outlives its invitation, which is deleted once answered or cancelled. So
      // the pending list is checked first, and a dead invitation never offers Accept and Decline.
      // If that check cannot run, the dialog opens anyway and the backend has the last word.
      if (checkingInvitation.current) return;
      checkingInvitation.current = true;
      const loaded = await useInvitationStore.getState().loadReceived().then(() => true, () => false);
      checkingInvitation.current = false;
      const pending = useInvitationStore.getState().received?.find((item) => item.id === target.invitationId);
      if (loaded && !pending) { setNotice(INVITATION_GONE); return; }
      setInvitation({ id: target.invitationId, householdId: target.householdId, householdName: pending?.household.name, message: notification.message });
      return;
    }
    // A household the user was just added to is missing from a list loaded earlier, and the
    // destination screens read that list to decide whether the household is available.
    const { households, loadHouseholds } = useHouseholdStore.getState();
    if (households && !households.some((household) => household.id === target.householdId)) {
      await loadHouseholds().catch(() => {});
    }
    if (target.kind === 'task') push({ pathname: '/households/[householdId]/tasks/[taskId]', params: { householdId: target.householdId, taskId: target.taskId } });
    else if (target.kind === 'expense') push({ pathname: '/households/[householdId]/expenses/[expenseId]', params: { householdId: target.householdId, expenseId: target.expenseId } });
    else push({ pathname: '/households/[householdId]', params: { householdId: target.householdId } });
  }

  // Accepting reloads the household list, so the new household can be opened straight away.
  async function answerInvitation(accepted: boolean) {
    if (!invitation) return;
    const { id, householdId, householdName } = invitation;
    const succeeded = await (accepted ? accept(id, householdName) : decline(id, householdName));
    setInvitation(null);
    if (accepted && succeeded) push({ pathname: '/households/[householdId]', params: { householdId } });
  }

  async function remove(notification: Notification) {
    setDeletingId(notification.id);
    try { await useNotificationStore.getState().deleteNotification(notification.id); }
    catch (error) { setNotice(errorMessage(error, 'Could not delete the notification.')); }
    finally { setDeletingId(''); }
  }

  async function markAllRead() {
    setMarkingAll(true);
    try { await useNotificationStore.getState().markAllRead(); }
    catch (error) { setNotice(errorMessage(error, 'Could not mark the notifications as read.')); }
    finally { setMarkingAll(false); }
  }

  const heading = filter === 'unread' ? `Unread (${current?.pagination.total ?? 0})` : `All (${current?.pagination.total ?? 0})`;

  return (
    <AppShell
      title="Notifications"
      back
      actions={<HeaderAction icon="check-all" accessibilityLabel="Mark all as read" disabled={unreadCount === 0 || markingAll} onPress={markAllRead} />}>
      <View style={styles.filters}>
        {FILTERS.map((option) => (
          <Chip
            key={option.value}
            selected={filter === option.value}
            showSelectedOverlay
            onPress={() => changeFilter(option.value)}
            accessibilityState={{ selected: filter === option.value }}>
            {option.value === 'unread' && unreadCount > 0 ? `${option.label} (${unreadCount})` : option.label}
          </Chip>
        ))}
      </View>
      {!notifications ? (
        error
          ? <StatusMessage text={error} action="Try again" onAction={refresh} loading={refreshing} />
          : <ActivityIndicator style={styles.center} accessibilityLabel="Loading notifications" />
      ) : notifications.length === 0 ? (
        filter === 'unread'
          ? <StatusMessage text="You're all caught up. Nothing unread." action="Show all notifications" onAction={() => changeFilter('all')} />
          : <StatusMessage text="No notifications yet. Task assignments, completed tasks and household expenses will show up here." action="Refresh" onAction={refresh} loading={refreshing} />
      ) : (
        // A deleted row fades and the rest glide up. See tasks-screen.tsx for why the skip prop is set.
        <Animated.FlatList
          itemLayoutAnimation={rowShift}
          skipEnteringExitingAnimations
          data={notifications}
          keyExtractor={(notification) => notification.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ItemSeparatorComponent={() => <Divider />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text variant="titleMedium">{heading}</Text>
              {!!error && <HelperText type="error" accessibilityLiveRegion="polite">{error}</HelperText>}
            </View>
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} accessibilityLabel="Loading more notifications" /> : null}
          renderItem={({ item }) => (
            <Animated.View exiting={rowExit}>
              <NotificationRow notification={item} disabled={navigating} deleting={deletingId === item.id} onPress={() => void open(item)} onDelete={() => void remove(item)} />
            </Animated.View>
          )}
        />
      )}
      <AppDialog
        visible={!!invitation}
        onDismiss={() => setInvitation(null)}
        icon="email-outline"
        title="Household invitation"
        confirmLabel="Accept"
        onConfirm={() => void answerInvitation(true)}
        cancelLabel="Decline"
        onCancel={() => void answerInvitation(false)}
        busy={!!invitation && busyId === invitation.id}
      >
        {invitation?.message ?? ''}
      </AppDialog>
      <Snackbar visible={!!notice} onDismiss={() => setNotice('')} duration={4000}>{notice}</Snackbar>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  filters: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  list: { paddingVertical: 8, paddingBottom: 32, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { paddingHorizontal: 16, paddingVertical: 8, gap: 4 },
  footer: { paddingVertical: 16 },
});
