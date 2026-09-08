import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { Button, HelperText, Text, TextInput, useTheme } from 'react-native-paper';
import AppShell from '@/components/app-shell';
import { errorMessage } from '@/lib/errors';
import { useHouseholdStore } from '@/stores/household-store';

export default function CreateHouseholdScreen() {
  const createHousehold = useHouseholdStore((state) => state.createHousehold);
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);

  async function submit() {
    if (pending.current) return;
    const trimmed = name.trim();
    if (!trimmed) { setError('Give your household a name.'); return; }
    pending.current = true;
    setLoading(true);
    setError('');
    try {
      const household = await createHousehold(trimmed);
      // Replace this form so back from the new household returns to the list.
      router.replace({ pathname: '/households/[householdId]', params: { householdId: household.id } });
    } catch (error) { setError(errorMessage(error, 'Could not create the household. Please try again.')); }
    finally { pending.current = false; setLoading(false); }
  }

  return (
    <AppShell title="New household" back scroll>
      <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>You will be the owner and can add people who already have a HomeHub account.</Text>
      <TextInput label="Household name" mode="outlined" value={name} onChangeText={setName} autoFocus autoCapitalize="words" maxLength={80} disabled={loading} onSubmitEditing={submit} returnKeyType="done" />
      {!!error && <HelperText type="error" accessibilityLiveRegion="polite">{error}</HelperText>}
      <Button mode="contained" onPress={submit} loading={loading} disabled={loading} contentStyle={{ height: 50 }}>Create household</Button>
    </AppShell>
  );
}
