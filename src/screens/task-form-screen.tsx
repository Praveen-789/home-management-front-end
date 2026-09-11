import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Chip, HelperText, Menu, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';
import type { Task, TaskInput } from '@/api/tasks';
import AppShell, { goBack } from '@/components/app-shell';
import StatusMessage from '@/components/status-message';
import { errorMessage } from '@/lib/errors';
import { addDays, dueDateToIso, parseDateInput, toDateInput } from '@/lib/task-helpers';
import { isTaskPriority, PRIORITY_LABELS, TASK_PRIORITIES, type TaskPriority } from '@/lib/task-permissions';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { createTask, loadTask, selectTask, updateTask } from '@/redux/tasks-slice';
import { useAuthStore } from '@/stores/auth-store';
import { useHouseholdStore } from '@/stores/household-store';

// One screen serves two routes: with a taskId it edits that task, otherwise it creates one.
// Editing waits for the task so the form can start from its current values.
export default function TaskFormScreen() {
  const { householdId = '', taskId } = useLocalSearchParams<{ householdId: string; taskId?: string }>();
  const dispatch = useAppDispatch();
  const existing = useAppSelector((state) => (taskId ? selectTask(taskId)(state) : undefined));
  const [error, setError] = useState('');

  useEffect(() => {
    // A deep link to the edit route arrives without the task in the store.
    if (!taskId || existing) return;
    dispatch(loadTask({ householdId, taskId })).unwrap()
      .catch((error: unknown) => setError(errorMessage(error, 'Could not load this task.')));
  }, [dispatch, householdId, taskId, existing]);

  if (taskId && !existing) {
    return (
      <AppShell title="Edit task" back>
        {error
          ? <StatusMessage text={error} action="Go back" onAction={goBack} />
          : <ActivityIndicator style={styles.center} accessibilityLabel="Loading task" />}
      </AppShell>
    );
  }

  return <TaskForm householdId={householdId} task={existing} />;
}

function TaskForm({ householdId, task }: { householdId: string; task?: Task }) {
  const editing = !!task;
  const { colors } = useTheme();
  const dispatch = useAppDispatch();
  const userId = useAuthStore((state) => state.session?.user.id);
  const household = useHouseholdStore((state) => state.households?.find((item) => item.id === householdId));
  const members = useHouseholdStore((state) => state.membersByHousehold[householdId]);
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'MEDIUM');
  const [dueDate, setDueDate] = useState(task?.dueDate ? toDateInput(new Date(task.dueDate)) : '');
  const [assigneeId, setAssigneeId] = useState<string | null>(task?.assignedTo?.id ?? null);
  const [assigneeMenu, setAssigneeMenu] = useState(false);
  const [membersError, setMembersError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; dueDate?: string }>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);

  // The assignee picker lists household members; load them if this is the first screen to need them.
  useEffect(() => {
    if (members) return;
    useHouseholdStore.getState().loadMembers(householdId)
      .catch((error: unknown) => setMembersError(errorMessage(error, 'Could not load the members to assign.')));
  }, [householdId, members]);

  const assignee = members?.find((member) => member.user.id === assigneeId);
  // Someone who left the household keeps their name from the task until the user picks another.
  const assigneeName = assignee ? assignee.user.name : assigneeId ? (task?.assignedTo?.name ?? 'Former member') : 'Unassigned';

  function pickDueDate(daysFromToday: number | null) {
    setDueDate(daysFromToday === null ? '' : toDateInput(addDays(new Date(), daysFromToday)));
    setFieldErrors((current) => ({ ...current, dueDate: undefined }));
  }

  async function submit() {
    if (pending.current) return;
    const trimmedTitle = title.trim();
    const parsedDate = parseDateInput(dueDate);
    const errors: typeof fieldErrors = {};
    if (!trimmedTitle) errors.title = 'Enter a title for the task.';
    if (parsedDate === undefined) errors.dueDate = 'Enter the due date as YYYY-MM-DD, or leave it blank.';
    setFieldErrors(errors);
    if (!trimmedTitle || parsedDate === undefined) return;
    const input: TaskInput & { title: string } = {
      title: trimmedTitle,
      description: description.trim() || null,
      priority,
      dueDate: parsedDate ? dueDateToIso(parsedDate) : null,
      assignedToId: assigneeId,
    };
    pending.current = true;
    setLoading(true);
    setError('');
    try {
      if (task) await dispatch(updateTask({ householdId, taskId: task.id, input })).unwrap();
      else await dispatch(createTask({ householdId, input })).unwrap();
      // The list and detail screens already show the result from the store.
      goBack();
    } catch (error) {
      setError(errorMessage(error, editing ? 'Could not save this task. Please try again.' : 'Could not create this task. Please try again.'));
    } finally { pending.current = false; setLoading(false); }
  }

  return (
    <AppShell title={editing ? 'Edit task' : 'New task'} back scroll>
      <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
        {editing
          ? `Update this task for ${household?.name ?? 'your household'}.`
          : `Add a task for ${household?.name ?? 'your household'}. Everyone in the household can see it.`}
      </Text>
      <View>
        <TextInput label="Title" mode="outlined" value={title} onChangeText={setTitle} autoFocus={!editing} disabled={loading} error={!!fieldErrors.title} returnKeyType="next" />
        {!!fieldErrors.title && <HelperText type="error" accessibilityLiveRegion="polite">{fieldErrors.title}</HelperText>}
      </View>
      <TextInput label="Description (optional)" mode="outlined" value={description} onChangeText={setDescription} multiline numberOfLines={3} disabled={loading} />
      <View style={styles.field}>
        <Text variant="labelLarge">Priority</Text>
        <SegmentedButtons
          value={priority}
          onValueChange={(value) => { if (isTaskPriority(value)) setPriority(value); }}
          buttons={TASK_PRIORITIES.map((option) => ({ value: option, label: PRIORITY_LABELS[option], disabled: loading }))}
        />
      </View>
      <View style={styles.field}>
        <TextInput
          label="Due date (YYYY-MM-DD)"
          mode="outlined"
          value={dueDate}
          onChangeText={setDueDate}
          placeholder={toDateInput(new Date())}
          autoCapitalize="none"
          autoCorrect={false}
          disabled={loading}
          error={!!fieldErrors.dueDate}
          right={dueDate ? <TextInput.Icon icon="close" accessibilityLabel="Clear due date" onPress={() => pickDueDate(null)} /> : undefined}
        />
        {!!fieldErrors.dueDate && <HelperText type="error" accessibilityLiveRegion="polite">{fieldErrors.dueDate}</HelperText>}
        <View style={styles.chips}>
          <Chip compact icon="calendar-today" disabled={loading} onPress={() => pickDueDate(0)}>Today</Chip>
          <Chip compact icon="calendar-arrow-right" disabled={loading} onPress={() => pickDueDate(1)}>Tomorrow</Chip>
          <Chip compact icon="calendar-week" disabled={loading} onPress={() => pickDueDate(7)}>In a week</Chip>
        </View>
      </View>
      <View style={styles.field}>
        <Text variant="labelLarge">Assigned to</Text>
        <Menu
          visible={assigneeMenu}
          onDismiss={() => setAssigneeMenu(false)}
          anchorPosition="bottom"
          anchor={
            <Button mode="outlined" icon="account-outline" disabled={loading || !members} accessibilityLabel={`Assigned to ${assigneeName}`} onPress={() => setAssigneeMenu(true)}>
              {assigneeName}
            </Button>
          }>
          <Menu.Item title="Unassigned" leadingIcon={assigneeId === null ? 'check' : 'account-off-outline'} onPress={() => { setAssigneeId(null); setAssigneeMenu(false); }} />
          {members?.map((member) => (
            <Menu.Item
              key={member.user.id}
              title={member.user.id === userId ? `${member.user.name} (you)` : member.user.name}
              leadingIcon={member.user.id === assigneeId ? 'check' : 'account'}
              onPress={() => { setAssigneeId(member.user.id); setAssigneeMenu(false); }}
            />
          ))}
        </Menu>
        {membersError
          ? <HelperText type="error">{membersError}</HelperText>
          : <HelperText type="info">Only people in this household can be assigned.</HelperText>}
      </View>
      {!!error && <HelperText type="error" accessibilityLiveRegion="polite">{error}</HelperText>}
      <Button mode="contained" onPress={submit} loading={loading} disabled={loading} contentStyle={{ height: 50 }}>
        {editing ? 'Save changes' : 'Create task'}
      </Button>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  field: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
