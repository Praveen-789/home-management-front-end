import { StyleSheet, View } from 'react-native';
import { Checkbox, Chip, List, Text, useTheme } from 'react-native-paper';
import type { Task } from '@/api/tasks';
import { formatDueDate, isOverdue } from '@/lib/task-helpers';
import { PRIORITY_LABELS, STATUS_LABELS } from '@/lib/task-permissions';

type Props = {
  task: Task;
  // Whether the caller may change this task's status. Decides between a checkbox and a plain icon.
  canToggle: boolean;
  disabled: boolean;
  onToggle: (done: boolean) => void;
  onPress: () => void;
};

export default function TaskRow({ task, canToggle, disabled, onToggle, onPress }: Props) {
  const { colors } = useTheme();
  const done = task.status === 'DONE';
  const overdue = isOverdue(task);
  const statusIcon = done ? 'check-circle' : task.status === 'IN_PROGRESS' ? 'progress-clock' : 'checkbox-blank-circle-outline';
  const assignee = task.assignedTo ? task.assignedTo.name : 'Unassigned';

  return (
    <List.Item
      title={task.title}
      titleNumberOfLines={2}
      titleStyle={done ? [styles.done, { color: colors.onSurfaceVariant }] : undefined}
      accessibilityLabel={`${task.title}, ${STATUS_LABELS[task.status]}, ${assignee}${overdue ? ', overdue' : ''}`}
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ disabled }}
      style={disabled ? { opacity: 0.6 } : undefined}
      left={({ style }) => canToggle ? (
        <View
          style={[style, styles.checkbox]}
          accessible
          accessibilityRole="checkbox"
          accessibilityLabel={done ? 'Mark as to do' : 'Mark as done'}
        >
          <Checkbox
            status={done ? 'checked' : 'unchecked'}
            disabled={disabled}
            onPress={() => onToggle(!done)}
          />
        </View>
      ) : (
        <List.Icon icon={statusIcon} style={style} />
      )}
      description={() => (
        <View style={styles.details}>
          {task.dueDate && (
            <Chip compact icon={overdue ? 'alert-circle-outline' : 'calendar'} textStyle={overdue ? { color: colors.error } : undefined}>
              {formatDueDate(task.dueDate)}
            </Chip>
          )}
          {/* Medium is the default, so only the two unusual priorities take up space. */}
          {task.priority !== 'MEDIUM' && (
            <Chip compact icon={task.priority === 'HIGH' ? 'arrow-up-bold' : 'arrow-down-bold'}>{PRIORITY_LABELS[task.priority]}</Chip>
          )}
          {task.status === 'IN_PROGRESS' && <Chip compact icon="progress-clock">{STATUS_LABELS.IN_PROGRESS}</Chip>}
          <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>{assignee}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  done: { textDecorationLine: 'line-through' },
  checkbox: { justifyContent: 'center' },
  details: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 },
});
