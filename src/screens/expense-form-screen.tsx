import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Chip, HelperText, Menu, Text, TextInput, useTheme } from 'react-native-paper';
import type { Expense, ExpenseInput } from '@/api/expenses';
import { listTasks, type Task } from '@/api/tasks';
import AppShell, { goBack } from '@/components/app-shell';
import StatusMessage from '@/components/status-message';
import { errorMessage } from '@/lib/errors';
import { CURRENCY_SYMBOL, parseAmountInput } from '@/lib/expense-helpers';
import { CATEGORY_ICONS, CATEGORY_LABELS, EXPENSE_CATEGORIES, type ExpenseCategory } from '@/lib/expense-permissions';
import { STATUS_LABELS } from '@/lib/task-permissions';
import { useAuthStore } from '@/stores/auth-store';
import { useExpenseStore } from '@/stores/expense-store';
import { useHouseholdStore } from '@/stores/household-store';
import { withToken } from '@/stores/with-token';

// One screen serves two routes: with an expenseId it edits that expense, otherwise it creates one.
// A create opened from a task arrives with `taskId` and `taskTitle` so the link is preselected.
export default function ExpenseFormScreen() {
  const { householdId = '', expenseId, taskId, taskTitle } =
    useLocalSearchParams<{ householdId: string; expenseId?: string; taskId?: string; taskTitle?: string }>();
  const existing = useExpenseStore((state) => (expenseId ? state.expensesById[expenseId] : undefined));
  const loadExpense = useExpenseStore((state) => state.loadExpense);
  const [error, setError] = useState('');

  useEffect(() => {
    // A deep link to the edit route arrives without the expense in the store.
    if (!expenseId || existing) return;
    loadExpense(householdId, expenseId).catch((error: unknown) => setError(errorMessage(error, 'Could not load this expense.')));
  }, [loadExpense, householdId, expenseId, existing]);

  if (expenseId && !existing) {
    return (
      <AppShell title="Edit expense" back>
        {error
          ? <StatusMessage text={error} action="Go back" onAction={goBack} />
          : <ActivityIndicator style={styles.center} accessibilityLabel="Loading expense" />}
      </AppShell>
    );
  }

  return <ExpenseForm householdId={householdId} expense={existing} initialTask={taskId ? { id: taskId, title: taskTitle } : undefined} />;
}

type FormProps = { householdId: string; expense?: Expense; initialTask?: { id: string; title?: string } };

function ExpenseForm({ householdId, expense, initialTask }: FormProps) {
  const editing = !!expense;
  const { colors } = useTheme();
  const userId = useAuthStore((state) => state.session?.user.id);
  const household = useHouseholdStore((state) => state.households?.find((item) => item.id === householdId));
  const members = useHouseholdStore((state) => state.membersByHousehold[householdId]);
  const createExpense = useExpenseStore((state) => state.createExpense);
  const updateExpense = useExpenseStore((state) => state.updateExpense);
  const [amount, setAmount] = useState(expense?.amount ?? '');
  const [description, setDescription] = useState(expense?.description ?? '');
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'OTHER');
  const [payerId, setPayerId] = useState<string | undefined>(expense?.paidBy.id ?? userId);
  const [taskId, setTaskId] = useState<string | null>(expense?.task?.id ?? initialTask?.id ?? null);
  const [tasks, setTasks] = useState<Task[] | undefined>(undefined);
  const [payerMenu, setPayerMenu] = useState(false);
  const [taskMenu, setTaskMenu] = useState(false);
  const [membersError, setMembersError] = useState('');
  const [tasksError, setTasksError] = useState('');
  const [amountError, setAmountError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);

  // The payer picker lists household members; load them if this is the first screen to need them.
  useEffect(() => {
    if (members) return;
    useHouseholdStore.getState().loadMembers(householdId)
      .catch((error: unknown) => setMembersError(errorMessage(error, 'Could not load the members.')));
  }, [householdId, members]);

  // The task picker reads the task endpoint directly rather than the task screens' Redux store, so
  // the two features stay separate. The backend caps a page at 100, in its due-date order.
  useEffect(() => {
    withToken((token) => listTasks(token, householdId, { limit: 100 }))
      .then((page) => setTasks(page.tasks))
      .catch((error: unknown) => setTasksError(errorMessage(error, 'Could not load the tasks to link.')));
  }, [householdId]);

  const nameOf = (user: { id: string; name: string }) => (user.id === userId ? `${user.name} (you)` : user.name);
  const payer = members?.find((member) => member.user.id === payerId);
  // Someone who left the household keeps their name from the expense until the user picks another.
  const payerName = payer ? nameOf(payer.user) : payerId === userId ? 'You' : (expense?.paidBy.name ?? 'Former member');
  const linkedTask = tasks?.find((task) => task.id === taskId);
  const taskName = linkedTask ? linkedTask.title : taskId ? (expense?.task?.title ?? initialTask?.title ?? 'Selected task') : 'No task';

  async function submit() {
    if (pending.current) return;
    const parsedAmount = parseAmountInput(amount);
    setAmountError(parsedAmount ? '' : 'Enter a positive amount with up to two decimal places.');
    if (!parsedAmount || !payerId) return;
    const input: ExpenseInput & { amount: string } = {
      amount: parsedAmount,
      description: description.trim() || null,
      category,
      paidById: payerId,
      taskId,
    };
    pending.current = true;
    setLoading(true);
    setError('');
    try {
      if (expense) await updateExpense(householdId, expense.id, input);
      else await createExpense(householdId, input);
      // The list and detail screens already show the result from the store.
      goBack();
    } catch (error) {
      setError(errorMessage(error, editing ? 'Could not save this expense. Please try again.' : 'Could not record this expense. Please try again.'));
    } finally { pending.current = false; setLoading(false); }
  }

  return (
    <AppShell title={editing ? 'Edit expense' : 'New expense'} back scroll>
      <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
        {editing
          ? `Update this expense for ${household?.name ?? 'your household'}.`
          : `Record what was spent for ${household?.name ?? 'your household'}. Everyone in the household can see it.`}
      </Text>
      <View>
        <TextInput
          label="Amount"
          mode="outlined"
          value={amount}
          onChangeText={(text) => { setAmount(text); setAmountError(''); }}
          keyboardType="decimal-pad"
          autoFocus={!editing}
          disabled={loading}
          error={!!amountError}
          left={<TextInput.Affix text={CURRENCY_SYMBOL} />}
        />
        {!!amountError && <HelperText type="error" accessibilityLiveRegion="polite">{amountError}</HelperText>}
      </View>
      <TextInput label="Description (optional)" mode="outlined" value={description} onChangeText={setDescription} disabled={loading} />
      <View style={styles.field}>
        <Text variant="labelLarge">Category</Text>
        <View style={styles.chips}>
          {EXPENSE_CATEGORIES.map((option) => (
            <Chip
              key={option}
              icon={CATEGORY_ICONS[option]}
              selected={category === option}
              showSelectedOverlay
              disabled={loading}
              onPress={() => setCategory(option)}
              accessibilityState={{ selected: category === option }}>
              {CATEGORY_LABELS[option]}
            </Chip>
          ))}
        </View>
      </View>
      <View style={styles.field}>
        <Text variant="labelLarge">Paid by</Text>
        <Menu
          visible={payerMenu}
          onDismiss={() => setPayerMenu(false)}
          anchorPosition="bottom"
          anchor={
            <Button mode="outlined" icon="account-cash-outline" disabled={loading || !members} accessibilityLabel={`Paid by ${payerName}`} onPress={() => setPayerMenu(true)}>
              {payerName}
            </Button>
          }>
          {members?.map((member) => (
            <Menu.Item
              key={member.user.id}
              title={nameOf(member.user)}
              leadingIcon={member.user.id === payerId ? 'check' : 'account'}
              onPress={() => { setPayerId(member.user.id); setPayerMenu(false); }}
            />
          ))}
        </Menu>
        {membersError
          ? <HelperText type="error">{membersError}</HelperText>
          : <HelperText type="info">Only people in this household can be the payer.</HelperText>}
      </View>
      <View style={styles.field}>
        <Text variant="labelLarge">Task</Text>
        <Menu
          visible={taskMenu}
          onDismiss={() => setTaskMenu(false)}
          anchorPosition="bottom"
          anchor={
            <Button mode="outlined" icon="format-list-checks" disabled={loading || !tasks} accessibilityLabel={`Task: ${taskName}`} onPress={() => setTaskMenu(true)}>
              {taskName}
            </Button>
          }>
          <Menu.Item title="No task" leadingIcon={taskId === null ? 'check' : 'link-off'} onPress={() => { setTaskId(null); setTaskMenu(false); }} />
          {tasks?.map((task) => (
            <Menu.Item
              key={task.id}
              title={task.title}
              leadingIcon={task.id === taskId ? 'check' : task.status === 'DONE' ? 'check-circle-outline' : 'checkbox-blank-circle-outline'}
              accessibilityLabel={`${task.title}, ${STATUS_LABELS[task.status]}`}
              onPress={() => { setTaskId(task.id); setTaskMenu(false); }}
            />
          ))}
        </Menu>
        {tasksError
          ? <HelperText type="error">{tasksError}</HelperText>
          : <HelperText type="info">Optional. Link this expense to the chore it paid for.</HelperText>}
      </View>
      {!!error && <HelperText type="error" accessibilityLiveRegion="polite">{error}</HelperText>}
      <Button mode="contained" onPress={submit} loading={loading} disabled={loading} contentStyle={{ height: 50 }}>
        {editing ? 'Save changes' : 'Record expense'}
      </Button>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  field: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
