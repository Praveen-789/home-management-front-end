import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Snackbar, Text, useTheme } from 'react-native-paper';
import AppShell from '@/components/app-shell';
import PictureEditor from '@/components/picture-editor';
import AppDialog from '@/components/ui/app-dialog';
import UserAvatar from '@/components/user-avatar';
import { fonts } from '@/constants/fonts';
import usePictureActions from '@/hooks/use-picture-actions';
import { useAuthStore } from '@/stores/auth-store';

// The signed-in person's own page. For now it is where they set the picture everyone else sees
// next to their name: in member lists, chats, tasks and expenses.
export default function ProfileScreen() {
  const { colors } = useTheme();
  const user = useAuthStore((state) => state.session?.user);
  const [notice, setNotice] = useState('');
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const picture = usePictureActions({
    change: (file) => useAuthStore.getState().changeAvatar(file),
    remove: () => useAuthStore.getState().removeAvatar(),
    report: setNotice,
    changed: 'Your picture was updated.',
    removed: 'Your picture was removed.',
  });

  return (
    <AppShell title="Your profile" back scroll>
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
      </View>
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
});
