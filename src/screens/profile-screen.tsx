import { useState } from 'react';
import Constants from 'expo-constants';
import { Platform, StyleSheet, View } from 'react-native';
import { Button, SegmentedButtons, Snackbar, Text, useTheme } from 'react-native-paper';
import AppShell from '@/components/app-shell';
import LinkGoogleDialog from '@/components/auth/link-google-dialog';
import PictureEditor from '@/components/picture-editor';
import AppDialog from '@/components/ui/app-dialog';
import UserAvatar from '@/components/user-avatar';
import { fonts } from '@/constants/fonts';
import usePictureActions from '@/hooks/use-picture-actions';
import { isThemePreference, THEME_PREFERENCE_LABELS, THEME_PREFERENCE_SHORT_LABELS, THEME_PREFERENCES } from '@/lib/color-scheme';
import { errorMessage } from '@/lib/errors';
import { useAuthStore } from '@/stores/auth-store';
import { useThemeStore } from '@/stores/theme-store';

// The signed-in person's own tab: their picture, the app's appearance, and the account actions.
// The picture is what everyone else sees next to their name: in member lists, chats, tasks and
// expenses.
export default function ProfileScreen() {
  const { colors } = useTheme();
  const user = useAuthStore((state) => state.session?.user);
  const logout = useAuthStore((state) => state.logout);
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  const [notice, setNotice] = useState('');
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const picture = usePictureActions({
    change: (file) => useAuthStore.getState().changeAvatar(file),
    remove: () => useAuthStore.getState().removeAvatar(),
    report: setNotice,
    changed: 'Your picture was updated.',
    removed: 'Your picture was removed.',
  });

  // Runs once the user confirms in the dialog below. Success removes the signed-in screens, and
  // this one with them, so only a failure needs handling here.
  async function signOut() {
    setConfirmingSignOut(false);
    try { await logout(); }
    catch (error) { setNotice(errorMessage(error)); }
  }

  return (
    <AppShell title="Profile" tabs scroll>
      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.primaryContainer }]}>
          <PictureEditor
            label={user?.avatarUrl ? 'Change your profile picture' : 'Add a profile picture'}
            pictureUrl={user?.avatarUrl}
            name={user?.name ?? 'You'}
            busy={picture.busy}
            onPick={picture.pick}
            onRemove={() => setConfirmingRemoval(true)}>
            <UserAvatar name={user?.name ?? ''} url={user?.avatarUrl} size={120} style={{ backgroundColor: colors.background }} />
          </PictureEditor>
          <View style={styles.identity}>
            <Text variant="headlineSmall" style={[styles.name, { color: colors.onPrimaryContainer }]}>{user?.name}</Text>
            <Text variant="bodyLarge" style={{ color: colors.onPrimaryContainer }}>{user?.email}</Text>
          </View>
        </View>
        <Text variant="bodyMedium" style={[styles.hint, { color: colors.onSurfaceVariant }]}>
          Tap your picture to change it. Everyone you share a household with will see it next to your name.
        </Text>

        <View style={styles.section}>
          <Text variant="titleSmall" style={styles.sectionTitle}>Appearance</Text>
          <SegmentedButtons
            value={preference}
            onValueChange={(value) => { if (isThemePreference(value)) void setPreference(value); }}
            buttons={THEME_PREFERENCES.map((option) => ({ value: option, label: THEME_PREFERENCE_SHORT_LABELS[option], accessibilityLabel: THEME_PREFERENCE_LABELS[option] }))}
          />
        </View>

        <View style={styles.section}>
          <Text variant="titleSmall" style={styles.sectionTitle}>Account</Text>
          {/* Google sign-in only exists on Android so far. */}
          {Platform.OS === 'android' && (
            <Button mode="outlined" icon="google" onPress={() => setLinkingGoogle(true)}>Link Google account</Button>
          )}
          <Button mode="outlined" icon="logout" textColor={colors.error} onPress={() => setConfirmingSignOut(true)}>Sign out</Button>
        </View>

        <Text variant="labelSmall" style={[styles.version, { color: colors.onSurfaceVariant }]}>HomeHub v{Constants.expoConfig?.version}</Text>
      </View>
      <LinkGoogleDialog visible={linkingGoogle} onDismiss={() => setLinkingGoogle(false)} />
      <AppDialog
        visible={confirmingRemoval}
        onDismiss={() => setConfirmingRemoval(false)}
        icon="account-circle-outline"
        title="Remove your picture?"
        confirmLabel="Remove"
        onConfirm={() => { setConfirmingRemoval(false); picture.remove(); }}
      >
        Your initials will be shown instead.
      </AppDialog>
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
      <Snackbar visible={!!notice} onDismiss={() => setNotice('')} duration={4000}>{notice}</Snackbar>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  card: { padding: 28, borderRadius: 28, gap: 20, alignItems: 'center' },
  identity: { alignItems: 'center', gap: 4 },
  name: { fontFamily: fonts.bold, textAlign: 'center' },
  hint: { textAlign: 'center', paddingHorizontal: 12 },
  section: { gap: 12, marginTop: 8 },
  sectionTitle: { fontFamily: fonts.semiBold },
  version: { textAlign: 'center', paddingVertical: 8 },
});
