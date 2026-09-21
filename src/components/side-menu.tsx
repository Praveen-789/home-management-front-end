import { useState } from 'react';
import Constants from 'expo-constants';
import { router, usePathname } from 'expo-router';
import { DrawerContentScrollView, type DrawerContentComponentProps } from 'expo-router/drawer';
import { Platform, StyleSheet, View } from 'react-native';
import { Avatar, Badge, Drawer, Portal, SegmentedButtons, Snackbar, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinkGoogleDialog from '@/components/auth/link-google-dialog';
import AppDialog from '@/components/ui/app-dialog';
import { fonts } from '@/constants/fonts';
import { useHeaderColors } from '@/hooks/use-header-colors';
import { isThemePreference, THEME_PREFERENCE_LABELS, THEME_PREFERENCE_SHORT_LABELS, THEME_PREFERENCES } from '@/lib/color-scheme';
import { errorMessage } from '@/lib/errors';
import { unreadLabel } from '@/lib/notification-helpers';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { useThemeStore } from '@/stores/theme-store';

// "Praveen Kumar" becomes "PK". Array.from keeps an emoji or accented letter in one piece.
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]?.toUpperCase() ?? '').join('');

// What the drawer shows: who is signed in, where they can go, and the account options that used to
// crowd the home header. The drawer keeps this mounted while it is closed, so the dialogs below
// stay on screen after a tap has closed the menu.
export default function SideMenu({ navigation }: DrawerContentComponentProps) {
  const { colors } = useTheme();
  const header = useHeaderColors();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const user = useAuthStore((state) => state.session?.user);
  const logout = useAuthStore((state) => state.logout);
  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [signOutError, setSignOutError] = useState('');

  // Every item closes the menu first, so the user sees where the tap took them.
  function choose(action: () => void) {
    navigation.closeDrawer();
    action();
  }

  // Runs once the user confirms in the dialog below. Success removes the signed-in screens, and this
  // menu with them, so only a failure needs handling here.
  async function signOut() {
    setConfirmingSignOut(false);
    setSignOutError('');
    try { await logout(); }
    catch (error) { setSignOutError(errorMessage(error)); }
  }

  return (
    <>
      <DrawerContentScrollView contentContainerStyle={styles.content}>
        {/* The drawer slides under the status bar, whose icons AppShell keeps white for the green
            header. This block continues that green, so the clock stays readable in light mode too. */}
        <View style={[styles.profile, { backgroundColor: header.background, paddingTop: insets.top + 20 }]}>
          <Avatar.Text size={52} label={initials(user?.name ?? '') || '?'} color={colors.onPrimaryContainer} style={{ backgroundColor: colors.primaryContainer }} labelStyle={{ fontFamily: fonts.semiBold }} />
          <View style={styles.identity}>
            <Text variant="titleMedium" numberOfLines={1} style={[styles.name, { color: header.foreground }]}>{user?.name}</Text>
            <Text variant="bodyMedium" numberOfLines={1} style={{ color: header.foreground, opacity: 0.8 }}>{user?.email}</Text>
          </View>
        </View>

        <Drawer.Section>
          <Drawer.Item label="Chats" icon="chat-outline" active={pathname.startsWith('/chats')} onPress={() => choose(() => router.navigate('/chats'))} />
          <Drawer.Item label="Households" icon="home-outline" active={pathname === '/' || pathname.startsWith('/households')} onPress={() => choose(() => { if (pathname !== '/') router.dismissTo('/'); })} />
          {/* navigate, not push: a quick second tap finds the screen already open instead of stacking a copy. */}
          <Drawer.Item
            label="Notifications"
            icon="bell-outline"
            active={pathname === '/notifications'}
            accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadLabel(unreadCount)} unread` : 'Notifications'}
            right={() => (unreadCount > 0 ? <Badge size={22}>{unreadLabel(unreadCount)}</Badge> : null)}
            onPress={() => choose(() => router.navigate('/notifications'))}
          />
        </Drawer.Section>

        <Drawer.Section title="Appearance">
          <SegmentedButtons
            style={styles.appearance}
            value={preference}
            onValueChange={(value) => { if (isThemePreference(value)) void setPreference(value); }}
            buttons={THEME_PREFERENCES.map((option) => ({ value: option, label: THEME_PREFERENCE_SHORT_LABELS[option], accessibilityLabel: THEME_PREFERENCE_LABELS[option] }))}
          />
        </Drawer.Section>

        <Drawer.Section showDivider={false}>
          {/* Google sign-in only exists on Android so far. */}
          {Platform.OS === 'android' && <Drawer.Item label="Link Google account" icon="google" onPress={() => choose(() => setLinkingGoogle(true))} />}
          <Drawer.Item label="Sign out" icon="logout" onPress={() => choose(() => setConfirmingSignOut(true))} />
        </Drawer.Section>

        <Text variant="labelSmall" style={[styles.version, { color: colors.onSurfaceVariant }]}>HomeHub v{Constants.expoConfig?.version}</Text>
      </DrawerContentScrollView>

      <LinkGoogleDialog visible={linkingGoogle} onDismiss={() => setLinkingGoogle(false)} />
      <AppDialog
        visible={confirmingSignOut}
        onDismiss={() => setConfirmingSignOut(false)}
        icon="logout"
        title="Sign out?"
        confirmLabel="Sign out"
        onConfirm={signOut}
      >
        You will need to sign in again to see your households.
      </AppDialog>
      {/* A Portal, because the closed drawer sits off screen and would take the message with it. */}
      <Portal>
        <Snackbar visible={!!signOutError} onDismiss={() => setSignOutError('')}>{signOutError}</Snackbar>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  // The scroll view's own padding is dropped: the profile block reaches the top edge and handles the
  // status bar inset itself, and Paper's drawer items already carry Material's 12px side margins.
  content: { flexGrow: 1, paddingTop: 0, paddingStart: 0, paddingEnd: 0 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 24, paddingBottom: 20, marginBottom: 8 },
  identity: { flex: 1 },
  name: { fontFamily: fonts.semiBold },
  appearance: { marginHorizontal: 20, marginBottom: 16 },
  // Pushed to the bottom of the drawer when the menu is shorter than the screen.
  version: { marginTop: 'auto', paddingHorizontal: 28, paddingVertical: 16 },
});
