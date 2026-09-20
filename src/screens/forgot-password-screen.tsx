import { useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';
import { Button, HelperText, TextInput, useTheme } from 'react-native-paper';
import { requestPasswordReset } from '@/api/auth';
import AuthShell from '@/components/auth/auth-shell';
import { isEmail } from '@/lib/password-reset';
import { fonts } from '@/constants/fonts';

// Step one of a reset: ask for the code. The backend answers the same way for any address, so
// the next screen opens regardless and the person is told to check their inbox there.
export default function ForgotPasswordScreen() {
  const { colors } = useTheme();
  const { email: initialEmail } = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(initialEmail ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);

  async function submit() {
    if (pending.current) return;
    const trimmed = email.trim();
    if (!isEmail(trimmed)) { setError('Enter the email address you signed up with.'); return; }
    pending.current = true;
    setLoading(true);
    setError('');
    try {
      await requestPasswordReset(trimmed);
      router.replace({ pathname: '/reset-password', params: { email: trimmed, sentAt: String(Date.now()) } });
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not send the code. Please try again.'); }
    finally { pending.current = false; setLoading(false); }
  }

  return (
    <AuthShell title="Forgot your password?" subtitle="We will email you a six-digit code to set a new one.">
      <TextInput
        label="Email address"
        mode="outlined"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        autoFocus={!initialEmail}
        disabled={loading}
        returnKeyType="send"
        onSubmitEditing={submit}
        left={<TextInput.Icon icon="email-outline" />}
        style={{ backgroundColor: colors.elevation.level1 }}
        outlineStyle={styles.inputOutline}
      />
      {!!error && <HelperText type="error" accessibilityLiveRegion="polite">{error}</HelperText>}
      <Button mode="contained" onPress={submit} loading={loading} disabled={loading} style={styles.button} contentStyle={styles.buttonContent} labelStyle={styles.buttonLabel}>
        Send code
      </Button>
      <Button disabled={loading} onPress={() => router.replace({ pathname: '/reset-password', params: isEmail(email) ? { email: email.trim() } : {} })}>
        I already have a code
      </Button>
      <Button disabled={loading} onPress={() => router.replace('/login')}>Back to sign in</Button>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  inputOutline: { borderRadius: 14 },
  button: { borderRadius: 14 },
  buttonContent: { minHeight: 52 },
  buttonLabel: { fontFamily: fonts.bold, fontSize: 16 },
});
