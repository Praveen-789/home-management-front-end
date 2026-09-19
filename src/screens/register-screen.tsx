import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { Button, HelperText, TextInput } from 'react-native-paper';
import AuthShell from '@/components/auth/auth-shell';
import { authRequest } from '@/api/auth';
import { passwordProblem } from '@/lib/password-reset';

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);

  async function submit() {
    if (pending.current) return;
    if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email.trim()) || !password) {
      setError('Enter your name, a valid email address, and a password.');
      return;
    }
    const problem = passwordProblem(password, confirmPassword);
    if (problem) { setError(problem); return; }
    pending.current = true;
    setLoading(true);
    setError('');
    try {
      await authRequest('register', { name: name.trim(), email: email.trim(), password });
      router.replace({ pathname: '/login', params: { registered: '1' } });
    } catch (error) { setError(error instanceof Error ? error.message : 'Registration failed. Please try again.'); }
    finally { pending.current = false; setLoading(false); }
  }

  return (
    <AuthShell title="Make yourself at home" subtitle="Create an account to get started.">
      <TextInput label="Full name" mode="outlined" value={name} onChangeText={setName} autoComplete="name" autoCapitalize="words" disabled={loading} />
      <TextInput label="Email" mode="outlined" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" disabled={loading} />
      <TextInput label="Password" mode="outlined" value={password} onChangeText={setPassword} secureTextEntry={!visible} autoCapitalize="none" autoComplete="new-password" disabled={loading} right={<TextInput.Icon icon={visible ? 'eye-off' : 'eye'} accessibilityLabel={visible ? 'Hide passwords' : 'Show passwords'} onPress={() => setVisible(!visible)} />} />
      <TextInput label="Confirm password" mode="outlined" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!visible} autoCapitalize="none" autoComplete="new-password" disabled={loading} onSubmitEditing={submit} returnKeyType="go" />
      {!!error && <HelperText type="error" accessibilityLiveRegion="polite">{error}</HelperText>}
      <Button mode="contained" onPress={submit} loading={loading} disabled={loading} contentStyle={{ height: 50 }}>Create account</Button>
      <Button disabled={loading} onPress={() => router.replace('/login')}>Already have an account? Sign in</Button>
    </AuthShell>
  );
}
