import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View, type TextInput as NativeTextInput } from 'react-native';
import { Button, HelperText, Icon, Text, TextInput, useTheme } from 'react-native-paper';
import { requestPasswordReset, resetPassword } from '@/api/auth';
import AuthShell from '@/components/auth/auth-shell';
import { isCompleteCode, isEmail, normalizeCode, passwordProblem, resendWait } from '@/lib/password-reset';

// Step two of a reset: the emailed code plus the new password. `sentAt` arrives from the previous
// screen so the resend button can wait out the backend's cooldown instead of failing silently.
export default function ResetPasswordScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ email?: string; sentAt?: string }>();
  const passwordInput = useRef<NativeTextInput>(null);
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(params.sentAt ? 'Check your inbox for the code. It is valid for 15 minutes.' : '');
  const [sentAt, setSentAt] = useState(() => Number(params.sentAt) || 0);
  const [now, setNow] = useState(() => Date.now());
  const pending = useRef(false);
  const wait = resendWait(sentAt, now);

  // Ticks once a second until the cooldown has passed, then stops itself.
  useEffect(() => {
    if (resendWait(sentAt, Date.now()) === 0) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (resendWait(sentAt, current) === 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [sentAt]);

  async function submit() {
    if (pending.current) return;
    const trimmed = email.trim();
    if (!isEmail(trimmed)) { setError('Enter the email address you signed up with.'); return; }
    if (!isCompleteCode(code)) { setError('Enter the six-digit code from the email.'); return; }
    const problem = passwordProblem(password, confirmation);
    if (problem) { setError(problem); return; }
    pending.current = true;
    setLoading(true);
    setError('');
    try {
      await resetPassword(trimmed, code, password);
      router.replace({ pathname: '/login', params: { reset: '1' } });
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not reset the password. Please try again.'); }
    finally { pending.current = false; setLoading(false); }
  }

  async function resend() {
    const trimmed = email.trim();
    if (!isEmail(trimmed)) { setError('Enter the email address you signed up with.'); return; }
    setResending(true);
    setError('');
    try {
      await requestPasswordReset(trimmed);
      setSentAt(Date.now());
      setNow(Date.now());
      setCode('');
      setNotice('If that email is registered, a new code is on its way. Only the newest code works.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not send a new code. Please try again.'); }
    finally { setResending(false); }
  }

  const busy = loading || resending;

  return (
    <AuthShell title="Set a new password" subtitle="Enter the code we emailed you and choose a new password.">
      {!!notice && <View style={[styles.notice, { backgroundColor: colors.primaryContainer }]}>
        <Icon source="email-check-outline" size={22} color={colors.onPrimaryContainer} />
        <Text style={[styles.noticeText, { color: colors.onPrimaryContainer }]} accessibilityLiveRegion="polite">{notice}</Text>
      </View>}
      <TextInput label="Email address" mode="outlined" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" disabled={busy} left={<TextInput.Icon icon="email-outline" />} style={{ backgroundColor: colors.elevation.level1 }} outlineStyle={styles.inputOutline} />
      <TextInput
        label="Six-digit code"
        mode="outlined"
        value={code}
        onChangeText={(text) => setCode(normalizeCode(text))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        autoFocus={!!params.email}
        disabled={busy}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordInput.current?.focus()}
        left={<TextInput.Icon icon="numeric" />}
        style={{ backgroundColor: colors.elevation.level1 }}
        outlineStyle={styles.inputOutline}
      />
      <TextInput ref={passwordInput} label="New password" mode="outlined" value={password} onChangeText={setPassword} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" disabled={busy} left={<TextInput.Icon icon="lock-outline" />} style={{ backgroundColor: colors.elevation.level1 }} outlineStyle={styles.inputOutline} right={<TextInput.Icon icon={visible ? 'eye-off' : 'eye'} accessibilityLabel={visible ? 'Hide passwords' : 'Show passwords'} onPress={() => setVisible(!visible)} />} />
      <TextInput label="Confirm new password" mode="outlined" value={confirmation} onChangeText={setConfirmation} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" disabled={busy} onSubmitEditing={submit} returnKeyType="go" left={<TextInput.Icon icon="lock-check-outline" />} style={{ backgroundColor: colors.elevation.level1 }} outlineStyle={styles.inputOutline} />
      <HelperText type={error ? 'error' : 'info'} accessibilityLiveRegion="polite">{error || 'At least 8 characters.'}</HelperText>
      <Button mode="contained" onPress={submit} loading={loading} disabled={busy} style={styles.button} contentStyle={styles.buttonContent} labelStyle={styles.buttonLabel}>
        Set new password
      </Button>
      <Button onPress={resend} loading={resending} disabled={busy || wait > 0}>
        {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
      </Button>
      <Button disabled={busy} onPress={() => router.replace('/login')}>Back to sign in</Button>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  inputOutline: { borderRadius: 14 },
  button: { borderRadius: 14 },
  buttonContent: { minHeight: 52 },
  buttonLabel: { fontWeight: '700', fontSize: 16 },
  notice: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10, borderRadius: 14 },
  noticeText: { flex: 1 },
});
