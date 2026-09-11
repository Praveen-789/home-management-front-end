import usePushOnce from '@/hooks/use-push-once';
import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Chip, Dialog, HelperText, Icon, List, Portal, SegmentedButtons, Snackbar, Text, useTheme } from 'react-native-paper';
import AppShell, { goBack } from '@/components/app-shell';
import StatusMessage from '@/components/status-message';
import ImageGrid from '@/components/image-grid';
import ImageViewer from '@/components/image-viewer';
import type { Photo } from '@/api/images';
import { pickImage, type ImageSource } from '@/lib/pick-image';
import { errorMessage } from '@/lib/errors';
import { formatDueDate, isOverdue } from '@/lib/task-helpers';
import { canChangeStatus, canManageTask, isTaskStatus, PRIORITY_LABELS, STATUS_LABELS, TASK_STATUSES, type TaskStatus } from '@/lib/task-permissions';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { addTaskImage, deleteTask, isNotFound, loadTask, removeTaskImage, selectTask, updateTask } from '@/redux/tasks-slice';
import { useAuthStore } from '@/stores/auth-store';
import { useHouseholdStore } from '@/stores/household-store';

const LOAD_ERROR = 'Could not load this task.';

export default function TaskDetailScreen() {
  const { push, navigating } = usePushOnce();
  const { householdId = '', taskId = '' } = useLocalSearchParams<{ householdId: string; taskId: string }>();
  const { colors } = useTheme();
  const dispatch = useAppDispatch();
  const userId = useAuthStore((state) => state.session?.user.id);
  const households = useHouseholdStore((state) => state.households);
  const task = useAppSelector(selectTask(taskId));
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
    // Always refetch so the screen shows the latest state, even when the list already had this task.
    const fetchTask = () => dispatch(loadTask({ householdId, taskId })).unwrap();
    const load = households === null ? loadHouseholds().then(fetchTask) : fetchTask();
    load.catch((error: unknown) => {
      if (isNotFound(error)) setMissing(true);
      else setError(errorMessage(error, LOAD_ERROR));
    });
  }, [dispatch, householdId, taskId]);

  async function retry() {
    setError('');
    try { await dispatch(loadTask({ householdId, taskId })).unwrap(); }
    catch (error) { setError(errorMessage(error, LOAD_ERROR)); }
  }

  if (missing || (households !== null && !household)) {
    return (
      <AppShell title="Task" back>
        <StatusMessage text="This task is no longer available. It may have been deleted, or you may have left the household." action="Go back" onAction={goBack} />
      </AppShell>
    );
  }

  if (!task) {
    return (
      <AppShell title="Task" back>
        {error
          ? <StatusMessage text={error} action="Try again" onAction={retry} />
          : <ActivityIndicator style={styles.center} accessibilityLabel="Loading task" />}
      </AppShell>
    );
  }

  const manages = !!role && !!userId && canManageTask(role, task, userId);
  const changesStatus = !!role && !!userId && canChangeStatus(role, task, userId);
  const overdue = isOverdue(task);
  const panelColors = { backgroundColor: colors.elevation.level1, borderColor: colors.surfaceVariant };
  const nameOf = (user: { id: string; name: string }) => (user.id === userId ? `${user.name} (you)` : user.name);

  async function setStatus(status: TaskStatus) {
    if (!task || status === task.status) return;
    setBusy(true);
    try {
      await dispatch(updateTask({ householdId, taskId: task.id, input: { status } })).unwrap();
      setNotice(`Marked as ${STATUS_LABELS[status].toLowerCase()}.`);
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  // Photos follow the status rule: managers and the assignee may add and remove them.
  async function addPhoto(source: ImageSource) {
    if (!task) return;
    setUploading(true);
    try {
      const file = await pickImage(source);
      if (file) {
        await dispatch(addTaskImage({ householdId, taskId: task.id, file })).unwrap();
        setNotice('Photo added.');
      }
    } catch (error) { setNotice(errorMessage(error, 'Could not add the photo.')); }
    finally { setUploading(false); }
  }

  // The viewer closes first so the outcome shows in the snackbar underneath it.
  async function removePhoto(photo: Photo) {
    if (!task) return;
    setViewing(null);
    setBusy(true);
    try {
      await dispatch(removeTaskImage({ householdId, taskId: task.id, imageId: photo.id })).unwrap();
      setNotice('Photo removed.');
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function confirmDelete() {
    if (!task) return;
    setConfirmingDelete(false);
    setBusy(true);
    try {
      await dispatch(deleteTask({ householdId, taskId: task.id })).unwrap();
      // The list no longer holds the task, so returning shows it gone.
      goBack();
    } catch (error) {
      setNotice(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <AppShell title="Task" back scroll>
      <View style={[styles.hero, { backgroundColor: colors.primaryContainer }]}>
        <View style={styles.heroTop}>
          <Text variant="labelMedium" style={[styles.eyebrow, { color: colors.onPrimaryContainer }]}>{household?.name ?? 'YOUR HOUSEHOLD'}</Text>
          <Icon source="clipboard-check-outline" size={28} color={colors.onPrimaryContainer} />
        </View>
        <Text variant="headlineSmall" accessibilityRole="header" style={[styles.heading, { color: colors.onPrimaryContainer }]}>{task.title}</Text>
        <View style={styles.badges}>
          <Chip compact icon="flag-outline" style={{ backgroundColor: colors.background }} textStyle={{ color: colors.onBackground }}>{PRIORITY_LABELS[task.priority]} priority</Chip>
          {overdue && <Chip compact icon="clock-alert-outline" style={{ backgroundColor: colors.errorContainer }} textStyle={{ color: colors.onErrorContainer }}>Overdue</Chip>}
        </View>
      </View>
      <View style={styles.statusSection}>
      <Text variant="titleMedium" style={styles.heading} accessibilityRole="header">Task status</Text>
      {changesStatus ? (
        <SegmentedButtons
          value={task.status}
          onValueChange={(value) => { if (isTaskStatus(value)) void setStatus(value); }}
          buttons={TASK_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status], disabled: busy }))}
        />
      ) : (
        <View style={styles.chipRow}>
          <Chip compact icon={task.status === 'DONE' ? 'check-circle' : task.status === 'IN_PROGRESS' ? 'progress-clock' : 'checkbox-blank-circle-outline'}>
            {STATUS_LABELS[task.status]}
          </Chip>
          {!!role && <HelperText type="info">Only the assignee, the creator, or an owner or admin can change this task.</HelperText>}
        </View>
      )}
      </View>
      <List.Section style={[styles.details, panelColors]}>
        <Text variant="titleMedium" style={[styles.heading, styles.detailsHeading]} accessibilityRole="header">At a glance</Text>
        <List.Item
          title="Due"
          description={task.dueDate ? `${formatDueDate(task.dueDate)}${overdue ? ' (overdue)' : ''}` : 'No due date'}
          descriptionStyle={overdue ? { color: colors.error } : undefined}
          left={(props) => <List.Icon {...props} icon={overdue ? 'alert-circle-outline' : 'calendar'} color={overdue ? colors.error : props.color} />}
        />
        <View style={[styles.divider, { backgroundColor: colors.surfaceVariant }]} />
        <List.Item title="Assigned to" description={task.assignedTo ? nameOf(task.assignedTo) : 'Unassigned'} descriptionNumberOfLines={3} left={(props) => <List.Icon {...props} icon="account-outline" color={colors.primary} />} />
        <View style={[styles.divider, { backgroundColor: colors.surfaceVariant }]} />
        <List.Item title="Created by" description={`${nameOf(task.createdBy)} on ${new Date(task.createdAt).toLocaleDateString()}`} descriptionNumberOfLines={3} left={(props) => <List.Icon {...props} icon="account-plus-outline" color={colors.primary} />} />
      </List.Section>
      <View style={[styles.panel, panelColors]}>
        <Text variant="titleMedium" style={styles.heading} accessibilityRole="header">Description</Text>
        <Text variant="bodyMedium" style={[styles.body, { color: task.description ? colors.onSurface : colors.onSurfaceVariant }]}>
          {task.description ?? 'No description.'}
        </Text>
      </View>
      <View style={[styles.panel, panelColors]}>
        <ImageGrid images={task.images} canManage={changesStatus} busy={uploading || busy} onAdd={(source) => void addPhoto(source)} onOpen={setViewing} />
      </View>
      <ImageViewer photo={viewing} canRemove={changesStatus} busy={busy} onClose={() => setViewing(null)} onRemove={(photo) => void removePhoto(photo)} />
      <View style={[styles.panel, panelColors]}>
        <View style={styles.sectionTitle}>
          <Icon source="cash-multiple" size={24} color={colors.primary} />
          <Text variant="titleMedium" style={styles.heading} accessibilityRole="header">Expenses</Text>
        </View>
        <Text variant="bodyMedium" style={[styles.body, { color: colors.onSurfaceVariant }]}>Anyone in the household can record what this task cost.</Text>
        <View style={styles.actions}>
          <Button
            mode="contained-tonal"
            style={styles.button}
            contentStyle={styles.buttonContent}
            icon="cash-plus"
            disabled={busy || navigating}
            onPress={() => push({ pathname: '/households/[householdId]/expenses/create', params: { householdId, taskId, taskTitle: task.title } })}>
            Add expense
          </Button>
          <Button
            mode="outlined"
            icon="cash-multiple"
            style={styles.button}
            contentStyle={styles.buttonContent}
            disabled={busy || navigating}
            onPress={() => push({ pathname: '/households/[householdId]/expenses', params: { householdId, taskId, taskTitle: task.title } })}>
            View expenses
          </Button>
        </View>
      </View>
      {manages && (
        <View style={[styles.actions, styles.manageActions]}>
          <Button
            mode="outlined"
            icon="pencil-outline"
            style={styles.button}
            contentStyle={styles.buttonContent}
            disabled={busy || navigating}
            onPress={() => push({ pathname: '/households/[householdId]/tasks/[taskId]/edit', params: { householdId, taskId } })}>
            Edit
          </Button>
          <Button mode="text" icon="delete-outline" textColor={colors.error} contentStyle={styles.buttonContent} disabled={busy || navigating} onPress={() => setConfirmingDelete(true)}>
            Delete
          </Button>
        </View>
      )}
      <Portal>
        <Dialog visible={confirmingDelete} onDismiss={() => setConfirmingDelete(false)}>
          <Dialog.Title>Delete this task?</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">{`"${task.title}" will be removed for everyone in the household. This cannot be undone.`}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmingDelete(false)}>Cancel</Button>
            <Button textColor={colors.error} onPress={confirmDelete}>Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Snackbar visible={!!notice} onDismiss={() => setNotice('')} duration={4000}>{notice}</Snackbar>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  chipRow: { alignItems: 'flex-start', gap: 4 },
  hero: { padding: 22, borderRadius: 26, gap: 16 },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  eyebrow: { letterSpacing: 1.2, flex: 1 },
  heading: { fontWeight: '700' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusSection: { gap: 12, paddingVertical: 4 },
  panel: { padding: 20, borderRadius: 22, borderWidth: 1, gap: 12 },
  details: { marginVertical: 0, paddingVertical: 12, borderRadius: 22, borderWidth: 1 },
  detailsHeading: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 20 },
  body: { lineHeight: 23 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  button: { borderRadius: 14 },
  buttonContent: { minHeight: 48 },
  manageActions: { paddingTop: 4, paddingBottom: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
