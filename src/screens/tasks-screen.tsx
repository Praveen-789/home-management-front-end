import usePushOnce from '@/hooks/use-push-once';
import type { Task } from '@/api/tasks';
import AppShell from '@/components/app-shell';
import StatusMessage from '@/components/status-message';
import TaskRow from '@/components/task-row';
import { errorMessage } from '@/lib/errors';
import { FILTER_LABELS, type TaskFilter } from '@/lib/task-helpers';
import { canChangeStatus } from '@/lib/task-permissions';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { loadTasks, selectTaskList, updateTask } from '@/redux/tasks-slice';
import { useAuthStore } from '@/stores/auth-store';
import { useHouseholdStore } from '@/stores/household-store';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Chip, Divider, FAB, HelperText, Snackbar, Text } from 'react-native-paper';

const LOAD_ERROR = 'Could not load the tasks.';
const FILTERS: TaskFilter[] = ['ALL', 'TODO', 'IN_PROGRESS', 'DONE'];

export default function TasksScreen() {
  const { push, navigating } = usePushOnce();
  const { householdId = '' } = useLocalSearchParams<{ householdId: string }>();
  const dispatch = useAppDispatch();
  const userId = useAuthStore((state) => state.session?.user.id);
  const households = useHouseholdStore((state) => state.households);
  // Subscribes to this household's list in the Redux store; the screen re-renders when it changes.
  const list = useAppSelector(selectTaskList(householdId));
  const [filter, setFilter] = useState<TaskFilter>('ALL');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const household = households?.find((item) => item.id === householdId);
  const role = household?.role;
  // A list fetched for another filter is stale for this one, so treat it as not loaded yet.
  const tasks = list?.filter === filter ? list.tasks : undefined;
  const hasMore = !!list && list.filter === filter && list.pagination.page < list.pagination.totalPages;

  useEffect(() => {
    const { households, loadHouseholds } = useHouseholdStore.getState();
    // Dispatching a thunk returns a promise; unwrap() resolves with the result or throws the failure.
    const loadPage = () => dispatch(loadTasks({ householdId, filter })).unwrap();
    // The household list carries the caller's role, which decides which rows offer a checkbox.
    const load = households === null ? loadHouseholds().then(loadPage) : loadPage();
    load.catch((error: unknown) => setError(errorMessage(error, LOAD_ERROR)));
  }, [dispatch, householdId, filter]);

  // A new filter starts a fresh load, so an error from the previous one no longer applies.
  function changeFilter(option: TaskFilter) {
    setError('');
    setFilter(option);
  }

  async function refresh() {
    setRefreshing(true);
    setError('');
    try {
      await Promise.all([useHouseholdStore.getState().loadHouseholds(), dispatch(loadTasks({ householdId, filter })).unwrap()]);
    } catch (error) { setError(errorMessage(error, LOAD_ERROR)); }
    finally { setRefreshing(false); }
  }

  // Called by the list when the user nears the end. Fetches the next page while one remains.
  async function loadMore() {
    if (!list || !hasMore || loadingMore || refreshing) return;
    setLoadingMore(true);
    try { await dispatch(loadTasks({ householdId, filter, page: list.pagination.page + 1 })).unwrap(); }
    catch (error) { setNotice(errorMessage(error, 'Could not load more tasks.')); }
    finally { setLoadingMore(false); }
  }

  // The row checkbox: done, or back to "to do". The reducer drops the row if it leaves the current filter.
  async function toggle(task: Task, done: boolean) {
    setBusyId(task.id);
    try {
      await dispatch(updateTask({ householdId, taskId: task.id, input: { status: done ? 'DONE' : 'TODO' } })).unwrap();
      setNotice(done ? `"${task.title}" marked as done.` : `"${task.title}" moved back to to do.`);
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusyId(null); }
  }

  const openTask = (task: Task) => push({ pathname: '/households/[householdId]/tasks/[taskId]', params: { householdId, taskId: task.id } });
  const openCreate = () => push({ pathname: '/households/[householdId]/tasks/create', params: { householdId } });

  if (households !== null && !household) {
    return (
      <AppShell title="Tasks" back>
        <StatusMessage text="This household is not available. You may have been removed from it." action="Back to households" onAction={() => router.replace('/')} />
      </AppShell>
    );
  }

  const heading = `${filter === 'ALL' ? 'Tasks' : FILTER_LABELS[filter]} (${list?.filter === filter ? list.pagination.total : 0})`;

  return (
    <AppShell title={household ? `${household.name} tasks` : 'Tasks'} back>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filters}>
        {FILTERS.map((option) => (
          <Chip key={option} selected={filter === option} showSelectedOverlay onPress={() => changeFilter(option)} accessibilityState={{ selected: filter === option }}>
            {FILTER_LABELS[option]}
          </Chip>
        ))}
      </ScrollView>
      {!tasks ? (
        error
          ? <StatusMessage text={error} action="Try again" onAction={refresh} loading={refreshing} />
          : <ActivityIndicator style={styles.center} accessibilityLabel="Loading tasks" />
      ) : tasks?.length === 0 ? (
        filter === 'ALL'
          ? <StatusMessage text="No tasks yet. Add the first chore for your household." action="New task" loading={navigating} onAction={openCreate} />
          : <StatusMessage text={`No tasks are ${FILTER_LABELS[filter].toLowerCase()}.`} action="Show all tasks" onAction={() => changeFilter('ALL')} />
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(task) => task.id}
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
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} accessibilityLabel="Loading more tasks" /> : null}
          renderItem={({ item }) => (
            <TaskRow
              task={item}
              canToggle={!!role && !!userId && canChangeStatus(role, item, userId)}
              disabled={busyId !== null || navigating}
              onToggle={(done) => void toggle(item, done)}
              onPress={() => openTask(item)}
            />
          )}
        />
      )}
      {tasks && (tasks.length > 0 || filter !== 'ALL') && (
        <FAB icon="plus" label="New task" style={styles.fab} disabled={navigating} onPress={openCreate} />
      )}
      <Snackbar visible={!!notice} onDismiss={() => setNotice('')} duration={4000}>{notice}</Snackbar>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  filterBar: { flexGrow: 0 },
  filters: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  list: { paddingVertical: 8, paddingBottom: 96, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { paddingHorizontal: 16, paddingVertical: 8, gap: 4 },
  footer: { paddingVertical: 16 },
  fab: { position: 'absolute', right: 16, bottom: 16 },
});
