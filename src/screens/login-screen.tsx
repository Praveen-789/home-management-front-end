import GoogleLoginButton from '@/components/auth/google-login-button';
import usePushOnce from '@/hooks/use-push-once';
import AuthShell from '@/components/auth/auth-shell';
import { useAuthStore } from '@/stores/auth-store';
import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput as NativeTextInput } from 'react-native';
import { Button, HelperText, Icon, Text, TextInput, useTheme } from 'react-native-paper';
import { fonts } from '@/constants/fonts';

export default function LoginScreen() {
  const { push, navigating } = usePushOnce();
  const { colors } = useTheme();
  const passwordInput = useRef<NativeTextInput>(null);
  const { registered, reset } = useLocalSearchParams<{ registered?: string; reset?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const login = useAuthStore((state) => state.login);

  async function submit() {
    if (pending.current || googleBusy) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim()) || !password) {
      setError('Enter a valid email address and your password.');
      return;
    }
    pending.current = true;
    setLoading(true);
    setError('');
    try { await login(email.trim(), password); }
    catch (error) { setError(error instanceof Error ? error.message : 'Login failed. Please try again.'); }
    finally { pending.current = false; setLoading(false); }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your HomeHub account.">
      {(registered === '1' || reset === '1') && <View style={[styles.success, { backgroundColor: colors.primaryContainer }]}>
        <Icon source="check-circle-outline" size={22} color={colors.onPrimaryContainer} />
        <Text style={[styles.successText, { color: colors.onPrimaryContainer }]} accessibilityLiveRegion="polite">
          {reset === '1' ? 'Password updated. Sign in with your new password.' : 'Account created. You can now sign in.'}
        </Text>
      </View>}
      <TextInput label="Email address" mode="outlined" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" disabled={loading || googleBusy || navigating} returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordInput.current?.focus()} left={<TextInput.Icon icon="email-outline" />} style={{ backgroundColor: colors.elevation.level1 }} outlineStyle={styles.inputOutline} />
      <TextInput ref={passwordInput} label="Password" mode="outlined" value={password} onChangeText={setPassword} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} autoComplete="current-password" disabled={loading || googleBusy || navigating} onSubmitEditing={submit} returnKeyType="go" left={<TextInput.Icon icon="lock-outline" />} style={{ backgroundColor: colors.elevation.level1 }} outlineStyle={styles.inputOutline} right={<TextInput.Icon icon={visible ? 'eye-off' : 'eye'} accessibilityLabel={visible ? 'Hide password' : 'Show password'} onPress={() => setVisible(!visible)} />} />
      <Button compact disabled={loading || googleBusy || navigating} style={styles.forgot} onPress={() => push({ pathname: '/forgot-password', params: email.trim() ? { email: email.trim() } : {} })}>Forgot password?</Button>
      {!!error && <HelperText type="error" accessibilityLiveRegion="polite">{error}</HelperText>}
      <Button mode="contained" onPress={submit} loading={loading} disabled={loading || googleBusy || navigating} style={styles.button} contentStyle={styles.buttonContent} labelStyle={styles.buttonLabel}>Sign in</Button>
      <View style={styles.dividerRow}>
        <View style={[styles.divider, { backgroundColor: colors.surfaceVariant }]} />
        <Text variant="bodySmall" style={{ color: colors.onSurfaceVariant }}>New to HomeHub?</Text>
        <View style={[styles.divider, { backgroundColor: colors.surfaceVariant }]} />
      </View>
      <Button mode="outlined" disabled={loading || googleBusy || navigating} style={[styles.button, { borderColor: colors.outline }]} contentStyle={styles.buttonContent} onPress={() => push('/register')}>Create an account</Button>
      <GoogleLoginButton disabled={loading || navigating} onBusyChange={setGoogleBusy} />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  inputOutline: { borderRadius: 14 },
  button: { borderRadius: 14 },
  buttonContent: { minHeight: 52 },
  buttonLabel: { fontFamily: fonts.bold, fontSize: 16 },
  success: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10, borderRadius: 14 },
  successText: { flex: 1 },
  forgot: { alignSelf: 'flex-end', marginTop: -8 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  divider: { flex: 1, height: 1 },
});
