import { useRef, useState } from 'react';
import { HelperText, Text, TextInput, useTheme } from 'react-native-paper';
import AppDialog, { dialogBodyStyle } from '@/components/ui/app-dialog';
import { chooseGoogleAccount } from '@/lib/google-signin';
import { linkGoogleAccount } from '@/api/auth';
import { useAuthStore } from '@/stores/auth-store';
import { fonts } from '@/constants/fonts';

type Props = { visible: boolean; onDismiss: () => void };

// Links a Google account to a password account. The side menu opens it, and only offers it on
// Android, where Google sign-in is available.
export default function LinkGoogleDialog({ visible, onDismiss }: Props) {
  const { colors } = useTheme();
  const session = useAuthStore(state => state.session);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const pending = useRef(false);

  function close() {
    if (pending.current) return;
    onDismiss();
    setPassword('');
    setError('');
    setSuccess(false);
  }
  async function link() {
    if (!session || pending.current) return;
    if (!password) { setError('Enter your current HomeHub password.'); return; }
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const idToken = await chooseGoogleAccount();
      if (!idToken) return;
      await linkGoogleAccount(session.token, idToken, password);
      setPassword('');
      setSuccess(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not link Google. Please try again.');
    } finally { pending.current = false; setBusy(false); }
  }
  return (
    <AppDialog
      visible={visible}
      onDismiss={close}
      icon={success ? 'check-circle-outline' : 'google'}
      title={success ? 'Google linked' : 'Link Google account'}
      cancelLabel={success ? 'Done' : 'Cancel'}
      confirmLabel={success ? undefined : 'Choose Google account'}
      onConfirm={link}
      busy={busy}
      stacked
    >
      {success ? <Text variant="bodyMedium" style={[dialogBodyStyle, { color: colors.onSurfaceVariant }]} accessibilityLiveRegion="polite">You can now use either Google or your password to sign in.</Text> : <>
        <Text variant="bodyMedium" style={[dialogBodyStyle, { color: colors.onSurfaceVariant }]}>
          Choose the Google account matching <Text variant="bodyMedium" style={{ color: colors.onSurface, fontFamily: fonts.semiBold }}>{session?.user.email}</Text>, then confirm with your HomeHub password. If you signed up with Google, no linking is needed.
        </Text>
        <TextInput label="Current HomeHub password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" disabled={busy} mode="outlined" left={<TextInput.Icon icon="lock-outline" />} style={{ marginTop: 20 }} />
        {!!error && <HelperText type="error" accessibilityLiveRegion="polite">{error}</HelperText>}
      </>}
    </AppDialog>
  );
}
