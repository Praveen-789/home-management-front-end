import AuthShell from '@/components/auth/auth-shell';
import { useAuthStore } from '@/stores/auth-store';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';

export default function LoginScreen() {
  const { registered } = useLocalSearchParams<{ registered?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const login = useAuthStore((state) => state.login);

  async function submit() {
    if (pending.current) return;
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
      {registered === '1' && <Text accessibilityLiveRegion="polite">Account created. You can now sign in.</Text>}
      <TextInput label="Email" mode="outlined" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" disabled={loading} />
      <TextInput label="Password" mode="outlined" value={password} onChangeText={setPassword} secureTextEntry={!visible} autoCapitalize="none" autoComplete="current-password" disabled={loading} onSubmitEditing={submit} returnKeyType="go" right={<TextInput.Icon icon={visible ? 'eye-off' : 'eye'} accessibilityLabel={visible ? 'Hide password' : 'Show password'} onPress={() => setVisible(!visible)} />} />
      {!!error && <HelperText type="error" accessibilityLiveRegion="polite">{error}</HelperText>}
      <Button mode="contained" onPress={submit} loading={loading} disabled={loading} contentStyle={{ height: 50 }}>Sign in</Button>
      <Button disabled={loading} onPress={() => router.push('/register')}>New here? Create an account</Button>
    </AuthShell>
  );
}
