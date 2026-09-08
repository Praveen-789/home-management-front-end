import { StyleSheet, View } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';

type Props = { text: string; action: string; onAction: () => void; loading?: boolean };

// Centered copy with one call to action, used for empty, missing and failed states.
export default function StatusMessage({ text, action, onAction, loading }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <Text variant="bodyLarge" style={[styles.text, { color: colors.onSurfaceVariant }]} accessibilityLiveRegion="polite">{text}</Text>
      <Button mode="contained" onPress={onAction} loading={loading} disabled={loading}>{action}</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  text: { textAlign: 'center', maxWidth: 360 },
});
