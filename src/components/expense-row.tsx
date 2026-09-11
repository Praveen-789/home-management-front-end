import { StyleSheet, View } from 'react-native';
import { Chip, List, Text, useTheme } from 'react-native-paper';
import type { Expense } from '@/api/expenses';
import { formatAmount } from '@/lib/expense-helpers';
import { CATEGORY_ICONS, CATEGORY_LABELS } from '@/lib/expense-permissions';
import { formatDueDate } from '@/lib/task-helpers';

type Props = { expense: Expense; onPress: () => void; disabled?: boolean };

// A list row: what the money went on, its amount, and who paid when. The description is the title
// when there is one, otherwise the category stands in.
export default function ExpenseRow({ expense, onPress, disabled = false }: Props) {
  const { colors } = useTheme();
  const title = expense.description ?? CATEGORY_LABELS[expense.category];
  const amount = formatAmount(expense.amount);
  // The due-date formatter gives "Today", "Yesterday" or a short date, which suits recorded dates too.
  const when = formatDueDate(expense.createdAt);

  return (
    <List.Item
      title={title}
      titleNumberOfLines={2}
      accessibilityLabel={`${title}, ${amount}, paid by ${expense.paidBy.name}, ${when}`}
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ disabled }}
      style={disabled ? { opacity: 0.6 } : undefined}
      left={({ style }) => <List.Icon icon={CATEGORY_ICONS[expense.category]} style={style} />}
      right={() => <Text variant="titleMedium" style={styles.amount}>{amount}</Text>}
      description={() => (
        <View style={styles.details}>
          {expense.description !== null && (
            <Chip compact icon={CATEGORY_ICONS[expense.category]}>{CATEGORY_LABELS[expense.category]}</Chip>
          )}
          {expense.task && <Chip compact icon="format-list-checks">{expense.task.title}</Chip>}
          <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>{`${expense.paidBy.name} · ${when}`}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  amount: { alignSelf: 'center' },
  details: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 },
});
