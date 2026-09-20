import { StyleSheet, View } from 'react-native';
import { IconButton, List, Text, useTheme } from 'react-native-paper';
import type { Notification } from '@/api/notifications';
import { formatWhen, notificationIcon } from '@/lib/notification-helpers';
import { fonts } from '@/constants/fonts';

type Props = { notification: Notification; onPress: () => void; onDelete: () => void; disabled?: boolean; deleting?: boolean };

// An inbox row: the backend's title and message as written, when it arrived, and a dot while unread.
export default function NotificationRow({ notification, onPress, onDelete, disabled = false, deleting = false }: Props) {
  const { colors } = useTheme();
  const when = formatWhen(notification.createdAt);
  const unread = !notification.isRead;

  return (
    <List.Item
      title={notification.title}
      titleNumberOfLines={2}
      titleStyle={unread ? styles.unreadTitle : undefined}
      accessibilityLabel={`${unread ? 'Unread. ' : ''}${notification.title}. ${notification.message}. ${when}`}
      onPress={onPress}
      disabled={disabled}
      accessibilityState={{ disabled }}
      style={[unread && { backgroundColor: colors.elevation.level1 }, (disabled || deleting) && { opacity: 0.6 }]}
      left={({ style }) => (
        <View style={[style, styles.left]}>
          <View style={[styles.dot, { backgroundColor: unread ? colors.primary : 'transparent' }]} />
          <List.Icon icon={notificationIcon(notification.type)} color={unread ? colors.primary : colors.onSurfaceVariant} />
        </View>
      )}
      right={() => (
        <IconButton icon="delete-outline" size={20} style={styles.delete} disabled={disabled || deleting} loading={deleting} accessibilityLabel={`Delete notification: ${notification.title}`} onPress={onDelete} />
      )}
      description={() => (
        <View style={styles.details}>
          <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>{notification.message}</Text>
          <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>{when}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  unreadTitle: { fontFamily: fonts.bold },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  delete: { alignSelf: 'center', margin: 0 },
  details: { gap: 2, marginTop: 2 },
});
