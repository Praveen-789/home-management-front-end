import { useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, SegmentedButtons, Text, TextInput, useTheme } from 'react-native-paper';
import AppShell, { goBack } from '@/components/app-shell';
import { errorMessage } from '@/lib/errors';
import { assignableRoles, ROLE_LABELS, type AssignableRole } from '@/lib/household-permissions';
import { useHouseholdStore } from '@/stores/household-store';
import { useInvitationStore } from '@/stores/invitation-store';

// Sends an invitation. Nobody is added directly: the person becomes a member when they accept.
export default function AddMemberScreen() {
  const { householdId = '' } = useLocalSearchParams<{ householdId: string }>();
  const household = useHouseholdStore((state) => state.households?.find((item) => item.id === householdId));
  const invite = useInvitationStore((state) => state.invite);
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AssignableRole>('MEMBER');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  // Until the list is loaded the caller's role is unknown; the backend enforces the matrix regardless.
  const roles: AssignableRole[] = household ? assignableRoles(household.role) : ['MEMBER'];

  async function submit() {
    if (pending.current) return;
    const trimmed = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) { setError('Enter the email address they registered with.'); return; }
    pending.current = true;
    setLoading(true);
    setError('');
    try {
      await invite(householdId, trimmed, role);
      // The household screen already shows the pending invitation from the store.
      goBack();
    } catch (error) {
      setError(error instanceof Error && error.message === 'User not found'
        ? 'No HomeHub account uses this email address. Ask them to register first.'
        : errorMessage(error, 'Could not send this invitation. Please try again.'));
    } finally { pending.current = false; setLoading(false); }
  }

  return (
    <AppShell title="Invite member" back scroll>
      <Text variant="bodyMedium" style={{ color: colors.onSurfaceVariant }}>
        Invite someone who already has a HomeHub account to {household?.name ?? 'this household'}. The email must match the one they registered with. They join once they accept.
      </Text>
      <TextInput label="Email" mode="outlined" value={email} onChangeText={setEmail} autoFocus autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" disabled={loading} onSubmitEditing={submit} returnKeyType="go" />
      {roles.length > 1 ? (
        <View style={styles.roles}>
          <Text variant="labelLarge">Role</Text>
          <SegmentedButtons
            value={role}
            onValueChange={(value) => { if (value === 'ADMIN' || value === 'MEMBER') setRole(value); }}
            buttons={roles.map((option) => ({ value: option, label: ROLE_LABELS[option], disabled: loading }))}
          />
          <HelperText type="info">Admins can invite and remove members. Only the owner can manage admins.</HelperText>
        </View>
      ) : (
        <HelperText type="info">They will join as a member.</HelperText>
      )}
      {!!error && <HelperText type="error" accessibilityLiveRegion="polite">{error}</HelperText>}
      <Button mode="contained" icon="send" onPress={submit} loading={loading} disabled={loading} contentStyle={{ height: 50 }}>Send invitation</Button>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  roles: { gap: 8 },
});
