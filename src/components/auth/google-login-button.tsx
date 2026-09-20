import { useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Button, HelperText } from 'react-native-paper';
import { chooseGoogleAccount } from '@/lib/google-signin';
import { useAuthStore } from '@/stores/auth-store';
import { isApiError } from '@/api/client';

type Props = { disabled: boolean; onBusyChange: (busy: boolean) => void };
export default function GoogleLoginButton({ disabled, onBusyChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const loginWithGoogle = useAuthStore(state => state.loginWithGoogle);
  if (Platform.OS !== 'android') return null;

  async function signIn() {
    if (pending.current || disabled) return;
    pending.current = true;
    setLoading(true);
    onBusyChange(true);
    setError('');
    try {
      const idToken = await chooseGoogleAccount();
      if (idToken) await loginWithGoogle(idToken);
    } catch (error) {
      setError(isApiError(error) && error.status === 409
        ? 'Already have an account? Sign in with your password, then use Link Google account on Your households.'
        : error instanceof Error ? error.message : 'Google sign-in failed. Please try again.');
    } finally {
      pending.current = false;
      setLoading(false);
      onBusyChange(false);
    }
  }
  return <>
    <Button mode="outlined" icon="google" onPress={signIn} loading={loading} disabled={disabled || loading} contentStyle={{ minHeight: 50 }}>Continue with Google</Button>
    {!!error && <HelperText type="error" accessibilityLiveRegion="polite">{error}</HelperText>}
  </>;
}
