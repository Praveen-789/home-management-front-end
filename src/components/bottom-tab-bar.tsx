import { router, usePathname } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Badge, Icon, Text, TouchableRipple, useTheme } from 'react-native-paper';
import { fonts } from '@/constants/fonts';
import { unreadLabel } from '@/lib/notification-helpers';
import { useNotificationStore } from '@/stores/notification-store';

// The app's five places, each reachable in one tap from any of the others.
const TABS = [
  { path: '/', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { path: '/posts', label: 'Posts', icon: 'newspaper-variant-outline', activeIcon: 'newspaper-variant' },
  { path: '/chats', label: 'Chats', icon: 'chat-outline', activeIcon: 'chat' },
  { path: '/notifications', label: 'Alerts', icon: 'bell-outline', activeIcon: 'bell' },
  { path: '/profile', label: 'Profile', icon: 'account-circle-outline', activeIcon: 'account-circle' },
] as const;

// Which tab a path belongs to. Home owns the household screens, so it stays lit inside them.
const activePath = (pathname: string) =>
  TABS.find((tab) => tab.path !== '/' && (pathname === tab.path || pathname.startsWith(`${tab.path}/`)))?.path ?? '/';

// The bar across the bottom of the top-level screens. Deeper screens leave it out and offer a back
// arrow instead, so the thumb row only appears where the five places are siblings.
export default function BottomTabBar() {
  const { colors } = useTheme();
  const pathname = usePathname();
  const active = activePath(pathname);
  const unreadCount = useNotificationStore((state) => state.unreadCount);

  // navigate rather than push: tapping a tab returns to the copy already in the
  // stack instead of stacking a new one, and tapping the current tab does nothing.
  const open = (path: (typeof TABS)[number]['path']) => {
    if (path === active) return;
    if (path === '/') router.dismissTo('/');
    else router.navigate(path as `/posts` | `/chats` | `/notifications` | `/profile`);
  };

  return (
    <View style={[styles.bar, { backgroundColor: colors.elevation.level2, borderTopColor: colors.surfaceVariant }]} accessibilityRole="tablist">
      {TABS.map((tab) => {
        const selected = tab.path === active;
        const alerts = tab.path === '/notifications' && unreadCount > 0;
        return (
          <TouchableRipple
            key={tab.path}
            style={styles.tab}
            borderless
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={alerts ? `${tab.label}, ${unreadLabel(unreadCount)} unread` : tab.label}
            onPress={() => open(tab.path)}>
            <View style={styles.item}>
              <View style={[styles.pill, selected && { backgroundColor: colors.secondaryContainer }]}>
                <Icon source={selected ? tab.activeIcon : tab.icon} size={24} color={selected ? colors.onSecondaryContainer : colors.onSurfaceVariant} />
                {/* Decorative: the tab's label already announces the count. */}
                {alerts && <Badge size={16} style={styles.badge} importantForAccessibility="no" accessibilityElementsHidden>{unreadLabel(unreadCount)}</Badge>}
              </View>
              <Text variant="labelSmall" style={[selected && styles.activeLabel, { color: selected ? colors.onSurface : colors.onSurfaceVariant }]}>
                {tab.label}
              </Text>
            </View>
          </TouchableRipple>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1 },
  item: { alignItems: 'center', gap: 4, paddingTop: 10, paddingBottom: 12 },
  // Material 3's active-tab shape: a small pill behind the icon.
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -4, right: 6 },
  activeLabel: { fontFamily: fonts.semiBold },
});
