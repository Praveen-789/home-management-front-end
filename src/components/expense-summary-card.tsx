import { StyleSheet, View } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import type { ExpenseSummary } from '@/api/expenses';
import { formatAmount } from '@/lib/expense-helpers';

type Props = { summary: ExpenseSummary; userId?: string };

// The database totals for whatever the list is filtered by: the grand total, then who paid how much.
export default function ExpenseSummaryCard({ summary, userId }: Props) {
  const { colors } = useTheme();
  const noun = summary.count === 1 ? 'expense' : 'expenses';
  return (
    <Card mode="contained" style={styles.card} accessibilityLabel={`Total ${formatAmount(summary.total)} across ${summary.count} ${noun}`}>
      <Card.Content style={styles.content}>
        <Text variant="labelMedium" style={{ color: colors.onSurfaceVariant }}>Total</Text>
        <Text variant="headlineMedium">{formatAmount(summary.total)}</Text>
        <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>{summary.count} {noun}</Text>
        {summary.byPayer.length > 0 && (
          <View style={styles.payers}>
            {summary.byPayer.map((entry, index) => {
              const name = entry.paidBy ? (entry.paidBy.id === userId ? `${entry.paidBy.name} (you)` : entry.paidBy.name) : 'Former member';
              return (
                <View key={entry.paidBy?.id ?? index} style={styles.payer}>
                  <Text variant="bodyMedium" style={styles.payerName} numberOfLines={1}>{name}</Text>
                  <Text variant="bodyMedium">{formatAmount(entry.total)}</Text>
                </View>
              );
            })}
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginVertical: 8 },
  content: { gap: 2 },
  payers: { marginTop: 10, gap: 6 },
  payer: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  payerName: { flexShrink: 1 },
});
