import usePushOnce from '@/hooks/use-push-once';
import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Chip, List, Snackbar, Text, useTheme } from 'react-native-paper';
import AppDialog from '@/components/ui/app-dialog';
import { isApiError } from '@/api/client';
import AppShell, { goBack } from '@/components/app-shell';
import StatusMessage from '@/components/status-message';
import ImageGrid from '@/components/image-grid';
import ImageViewer from '@/components/image-viewer';
import type { Photo } from '@/api/images';
import { pickImage, type ImageSource } from '@/lib/pick-image';
import { errorMessage } from '@/lib/errors';
import { formatAmount } from '@/lib/expense-helpers';
import { canManageExpense, CATEGORY_ICONS, CATEGORY_LABELS } from '@/lib/expense-permissions';
import { formatDueDate } from '@/lib/task-helpers';
import { STATUS_LABELS } from '@/lib/task-permissions';
import { useAuthStore } from '@/stores/auth-store';
import { useExpenseStore } from '@/stores/expense-store';
import { useHouseholdStore } from '@/stores/household-store';

const LOAD_ERROR = 'Could not load this expense.';

export default function ExpenseDetailScreen() {
  const { push, navigating } = usePushOnce();
  const { householdId = '', expenseId = '' } = useLocalSearchParams<{ householdId: string; expenseId: string }>();
  const { colors } = useTheme();
  const userId = useAuthStore((state) => state.session?.user.id);
  const households = useHouseholdStore((state) => state.households);
  const expense = useExpenseStore((state) => state.expensesById[expenseId]);
  const loadExpense = useExpenseStore((state) => state.loadExpense);
  const deleteExpense = useExpenseStore((state) => state.deleteExpense);
  const addImage = useExpenseStore((state) => state.addImage);
  const removeImage = useExpenseStore((state) => state.removeImage);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [uploading, setUploading] = useState(false);

  const household = households?.find((item) => item.id === householdId);
  const role = household?.role;

  useEffect(() => {
    const { households, loadHouseholds } = useHouseholdStore.getState();
    // Always refetch so the screen shows the latest state, even when the list already had this expense.
    const fetchExpense = () => loadExpense(householdId, expenseId);
    const load = households === null ? loadHouseholds().then(fetchExpense) : fetchExpense();
    load.catch((error: unknown) => {
      if (isApiError(error) && error.status === 404) setMissing(true);
      else setError(errorMessage(error, LOAD_ERROR));
    });
  }, [loadExpense, householdId, expenseId]);

  async function retry() {
    setError('');
    try { await loadExpense(householdId, expenseId); }
    catch (error) { setError(errorMessage(error, LOAD_ERROR)); }
  }

  if (missing || (households !== null && !household)) {
    return (
      <AppShell title="Expense" back>
        <StatusMessage text="This expense is no longer available. It may have been deleted, or you may have left the household." action="Go back" onAction={goBack} />
      </AppShell>
    );
  }

  if (!expense) {
    return (
      <AppShell title="Expense" back>
        {error
          ? <StatusMessage text={error} action="Try again" onAction={retry} />
          : <ActivityIndicator style={styles.center} accessibilityLabel="Loading expense" />}
      </AppShell>
    );
  }

  const manages = !!role && !!userId && canManageExpense(role, expense, userId);
  const nameOf = (user: { id: string; name: string }) => (user.id === userId ? `${user.name} (you)` : user.name);
  const task = expense.task;

  // Receipts follow the edit rule: whoever may change the expense may add and remove them.
  async function addPhoto(source: ImageSource) {
    if (!expense) return;
    setUploading(true);
    try {
      const file = await pickImage(source);
      if (file) {
        await addImage(householdId, expense.id, file);
        setNotice('Photo added.');
      }
    } catch (error) { setNotice(errorMessage(error, 'Could not add the photo.')); }
    finally { setUploading(false); }
  }

  // The viewer closes first so the outcome shows in the snackbar underneath it.
  async function removePhoto(photo: Photo) {
    if (!expense) return;
    setViewing(null);
    setBusy(true);
    try {
      await removeImage(householdId, expense.id, photo.id);
      setNotice('Photo removed.');
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function confirmDelete() {
    if (!expense) return;
    setConfirmingDelete(false);
    setBusy(true);
    try {
      await deleteExpense(householdId, expense.id);
      // The list no longer holds the expense, so returning shows it gone.
      goBack();
    } catch (error) {
      setNotice(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <AppShell title="Expense" back scroll>
      <Text variant="displaySmall">{formatAmount(expense.amount)}</Text>
      <View style={styles.chipRow}>
        <Chip compact icon={CATEGORY_ICONS[expense.category]}>{CATEGORY_LABELS[expense.category]}</Chip>
      </View>
      <List.Section>
        <List.Item title="Paid by" description={nameOf(expense.paidBy)} left={(props) => <List.Icon {...props} icon="account-cash-outline" />} />
        <List.Item
          title="Recorded by"
          description={`${nameOf(expense.createdBy)} on ${new Date(expense.createdAt).toLocaleDateString()}`}
          left={(props) => <List.Icon {...props} icon="account-plus-outline" />}
        />
        {task ? (
          <List.Item
            title="Task"
            description={`${task.title} (${STATUS_LABELS[task.status].toLowerCase()})`}
            left={(props) => <List.Icon {...props} icon="format-list-checks" />}
            right={(props) => <List.Icon {...props} icon="chevron-right" />}
            accessibilityHint="Opens the task"
            disabled={navigating} onPress={() => push({ pathname: '/households/[householdId]/tasks/[taskId]', params: { householdId, taskId: task.id } })}
          />
        ) : (
          <List.Item title="Task" description="Not linked to a task" left={(props) => <List.Icon {...props} icon="format-list-checks" />} />
        )}
        <List.Item title="Recorded" description={formatDueDate(expense.createdAt)} left={(props) => <List.Icon {...props} icon="calendar" />} />
      </List.Section>
      <View style={styles.description}>
        <Text variant="labelLarge">Description</Text>
        <Text variant="bodyMedium" style={{ color: expense.description ? colors.onBackground : colors.onSurfaceVariant }}>
          {expense.description ?? 'No description.'}
        </Text>
      </View>
      <ImageGrid images={expense.images} canManage={manages} busy={uploading || busy} onAdd={(source) => void addPhoto(source)} onOpen={setViewing} />
      <ImageViewer photo={viewing} canRemove={manages} busy={busy} onClose={() => setViewing(null)} onRemove={(photo) => void removePhoto(photo)} />
      {manages ? (
        <View style={styles.actions}>
          <Button
            mode="outlined"
            icon="pencil-outline"
            disabled={busy || navigating}
            onPress={() => push({ pathname: '/households/[householdId]/expenses/[expenseId]/edit', params: { householdId, expenseId } })}>
            Edit
          </Button>
          <Button mode="outlined" icon="delete-outline" textColor={colors.error} disabled={busy || navigating} onPress={() => setConfirmingDelete(true)}>
            Delete
          </Button>
        </View>
      ) : (
        !!role && <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>Only the person who paid or recorded this, or an owner or admin, can change it.</Text>
      )}
      <AppDialog
        visible={confirmingDelete}
        onDismiss={() => setConfirmingDelete(false)}
        icon="trash-can-outline"
        tone="danger"
        title="Delete this expense?"
        confirmLabel="Delete"
        onConfirm={confirmDelete}
      >
        {`${formatAmount(expense.amount)} for ${expense.description ?? CATEGORY_LABELS[expense.category].toLowerCase()} will be removed for everyone in the household. This cannot be undone.`}
      </AppDialog>
      <Snackbar visible={!!notice} onDismiss={() => setNotice('')} duration={4000}>{notice}</Snackbar>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  chipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  description: { gap: 4 },
  actions: { flexDirection: 'row', gap: 12 },
});
