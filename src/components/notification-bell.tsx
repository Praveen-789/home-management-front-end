import HeaderAction from '@/components/header-action';
import { unreadLabel } from '@/lib/notification-helpers';
import { useNotificationStore } from '@/stores/notification-store';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Badge } from 'react-native-paper';

type Props = { onPress: () => void; disabled?: boolean };

// Header bell with the unread count. It refreshes the count whenever its screen gains focus, which
// covers returning from the inbox or from a screen that produced notifications.
export default function NotificationBell({ onPress, disabled = false }: Props) {
  const unreadCount = useNotificationStore((state) => state.unreadCount);

  useFocusEffect(useCallback(() => {
    useNotificationStore.getState().refreshUnreadCount().catch(() => {});
  }, []));

  const label = unreadLabel(unreadCount);
  return (
    <View>
      <HeaderAction
        icon={unreadCount > 0 ? 'bell' : 'bell-outline'}
        accessibilityLabel={unreadCount > 0 ? `Notifications, ${label} unread` : 'Notifications'}
        disabled={disabled}
        onPress={onPress}
      />
      {/* Decorative: the button's label already announces the count. */}
      <Badge visible={unreadCount > 0} size={18}  style={[styles.badge, { pointerEvents: 'none' }]} importantForAccessibility="no" accessibilityElementsHidden>{label}</Badge>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', top: 6, right: 4 },
});
