import usePushOnce from '@/hooks/use-push-once';
import type { Expense } from '@/api/expenses';
import AppShell from '@/components/app-shell';
import ExpenseRow from '@/components/expense-row';
import ExpenseSummaryCard from '@/components/expense-summary-card';
import StatusMessage from '@/components/status-message';
import { errorMessage } from '@/lib/errors';
import { sameFilter } from '@/lib/expense-helpers';
import { CATEGORY_ICONS, CATEGORY_LABELS, EXPENSE_CATEGORIES, type ExpenseCategory } from '@/lib/expense-permissions';
import { useAuthStore } from '@/stores/auth-store';
import { useExpenseStore } from '@/stores/expense-store';
import { useHouseholdStore } from '@/stores/household-store';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Chip, Divider, FAB, HelperText, Snackbar, Text } from 'react-native-paper';

const LOAD_ERROR = 'Could not load the expenses.';

// The household's expenses, filtered by category with the chips. Opened from a task with `taskId`,
// it shows only that task's expenses and offers a way back to the whole list.
export default function ExpensesScreen() {
  const { push, navigating } = usePushOnce();
  const { householdId = '', taskId, taskTitle } = useLocalSearchParams<{ householdId: string; taskId?: string; taskTitle?: string }>();
  const userId = useAuthStore((state) => state.session?.user.id);
  const households = useHouseholdStore((state) => state.households);
  const list = useExpenseStore((state) => state.listsByHousehold[householdId]);
  const summaryEntry = useExpenseStore((state) => state.summariesByHousehold[householdId]);
  const loadExpenses = useExpenseStore((state) => state.loadExpenses);
  const loadSummary = useExpenseStore((state) => state.loadSummary);
  const [category, setCategory] = useState<ExpenseCategory | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const household = households?.find((item) => item.id === householdId);
  const filter = { category, taskId };
  // A list fetched for another filter is stale for this one, so treat it as not loaded yet.
  const expenses = list && sameFilter(list.filter, filter) ? list.expenses : undefined;
  const hasMore = !!list && sameFilter(list.filter, filter) && list.pagination.page < list.pagination.totalPages;
  const summary = summaryEntry && sameFilter(summaryEntry.filter, filter) ? summaryEntry.summary : undefined;

  useEffect(() => {
    const { households, loadHouseholds } = useHouseholdStore.getState();
    const loadPage = () => loadExpenses(householdId, { category, taskId });
    // The household list carries the caller's role, which the detail screen needs for its actions.
    const load = households === null ? loadHouseholds().then(loadPage) : loadPage();
    load.catch((error: unknown) => setError(errorMessage(error, LOAD_ERROR)));
  }, [loadExpenses, householdId, category, taskId]);

  // Totals load once the list is in, and again whenever a change drops them from the store. A
  // failure only hides the card; pull to refresh tries again.
  useEffect(() => {
    if (!expenses || summary) return;
    loadSummary(householdId, { category, taskId }).catch(() => {});
  }, [loadSummary, householdId, category, taskId, expenses, summary]);

  // A new filter starts a fresh load, so an error from the previous one no longer applies.
  function changeCategory(option: ExpenseCategory | undefined) {
    setError('');
    setCategory(option);
  }

  async function refresh() {
    setRefreshing(true);
    setError('');
    try {
      await Promise.all([
        useHouseholdStore.getState().loadHouseholds(),
        loadExpenses(householdId, { category, taskId }),
        loadSummary(householdId, { category, taskId }),
      ]);
    } catch (error) { setError(errorMessage(error, LOAD_ERROR)); }
    finally { setRefreshing(false); }
  }

  // Called by the list when the user nears the end. Fetches the next page while one remains.
  async function loadMore() {
    if (!list || !hasMore || loadingMore || refreshing) return;
    setLoadingMore(true);
    try { await loadExpenses(householdId, { category, taskId }, list.pagination.page + 1); }
    catch (error) { setNotice(errorMessage(error, 'Could not load more expenses.')); }
    finally { setLoadingMore(false); }
  }

  const openExpense = (expense: Expense) =>
    push({ pathname: '/households/[householdId]/expenses/[expenseId]', params: { householdId, expenseId: expense.id } });
  const openCreate = () =>
    push({ pathname: '/households/[householdId]/expenses/create', params: { householdId, ...(taskId ? { taskId, taskTitle } : {}) } });
  const showAll = () => router.replace({ pathname: '/households/[householdId]/expenses', params: { householdId } });

  if (households !== null && !household) {
    return (
      <AppShell title="Expenses" back>
        <StatusMessage text="This household is not available. You may have been removed from it." action="Back to households" onAction={() => router.replace('/')} />
      </AppShell>
    );
  }

  const total = list && sameFilter(list.filter, filter) ? list.pagination.total : 0;
  const heading = `${category ? CATEGORY_LABELS[category] : 'Expenses'} (${total})`;

  function emptyState() {
    if (taskId) return <StatusMessage text={`No expenses are linked to "${taskTitle ?? 'this task'}" yet.`} action="Add expense" loading={navigating} onAction={openCreate} />;
    if (category) return <StatusMessage text={`No ${CATEGORY_LABELS[category].toLowerCase()} expenses yet.`} action="Show all expenses" onAction={() => changeCategory(undefined)} />;
    return <StatusMessage text="No expenses yet. Record the first one for your household." action="New expense" loading={navigating} onAction={openCreate} />;
  }

  return (
    <AppShell title={household ? `${household.name} expenses` : 'Expenses'} back>
      {taskId && (
        <View style={styles.taskBar}>
          <Text variant="bodyMedium" style={styles.taskLabel} numberOfLines={1}>{`For "${taskTitle ?? 'this task'}"`}</Text>
          <Chip compact icon="close" onPress={showAll}>All expenses</Chip>
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filters}>
        <Chip selected={!category} showSelectedOverlay onPress={() => changeCategory(undefined)} accessibilityState={{ selected: !category }}>All</Chip>
        {EXPENSE_CATEGORIES.map((option) => (
          <Chip
            key={option}
            icon={CATEGORY_ICONS[option]}
            selected={category === option}
            showSelectedOverlay
            onPress={() => changeCategory(option)}
            accessibilityState={{ selected: category === option }}>
            {CATEGORY_LABELS[option]}
          </Chip>
        ))}
      </ScrollView>
      {!expenses ? (
        error
          ? <StatusMessage text={error} action="Try again" onAction={refresh} loading={refreshing} />
          : <ActivityIndicator style={styles.center} accessibilityLabel="Loading expenses" />
      ) : expenses.length === 0 ? (
        emptyState()
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={(expense) => expense.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ItemSeparatorComponent={() => <Divider />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            <View>
              {summary && <ExpenseSummaryCard summary={summary} userId={userId} />}
              <View style={styles.header}>
                <Text variant="titleMedium">{heading}</Text>
                {!!error && <HelperText type="error" accessibilityLiveRegion="polite">{error}</HelperText>}
              </View>
            </View>
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} accessibilityLabel="Loading more expenses" /> : null}
          renderItem={({ item }) => <ExpenseRow disabled={navigating} expense={item} onPress={() => openExpense(item)} />}
        />
      )}
      {expenses && (expenses.length > 0 || category !== undefined) && (
        <FAB icon="plus" label="New expense" style={styles.fab} disabled={navigating} onPress={openCreate} />
      )}
      <Snackbar visible={!!notice} onDismiss={() => setNotice('')} duration={4000}>{notice}</Snackbar>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  taskBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  taskLabel: { flexShrink: 1 },
  filterBar: { flexGrow: 0 },
  filters: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  list: { paddingVertical: 8, paddingBottom: 96, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { paddingHorizontal: 16, paddingVertical: 8, gap: 4 },
  footer: { paddingVertical: 16 },
  fab: { position: 'absolute', right: 16, bottom: 16 },
});
