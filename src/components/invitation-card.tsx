import { StyleSheet, View } from 'react-native';
import { Button, Card, Icon, Text, useTheme } from 'react-native-paper';
import type { Invitation } from '@/api/invitations';
import { ROLE_LABELS } from '@/lib/household-permissions';
import { formatWhen } from '@/lib/notification-helpers';
import { fonts } from '@/constants/fonts';

type Props = { invitation: Invitation; onAccept: () => void; onDecline: () => void; disabled?: boolean; busy?: boolean };

// An invitation waiting for the signed-in user's answer: who is asking, which household, which role.
export default function InvitationCard({ invitation, onAccept, onDecline, disabled = false, busy = false }: Props) {
  const { colors } = useTheme();
  const role = ROLE_LABELS[invitation.role].toLowerCase();
  const sentence = `${invitation.invitedBy.name} wants to add you to ${invitation.household.name} as ${role}.`;
  return (
    <Card mode="contained" style={[styles.card, { backgroundColor: colors.secondaryContainer, borderColor: colors.outlineVariant }]} accessibilityLabel={`Invitation. ${sentence}`}>
      <View style={styles.content}>
        <View style={styles.top}>
          <View style={[styles.icon, { backgroundColor: colors.background }]}><Icon source="email-outline" size={24} color={colors.primary} /></View>
          <View style={styles.text}>
            <Text variant="titleMedium" style={[styles.heading, { color: colors.onSecondaryContainer }]}>{invitation.household.name}</Text>
            <Text variant="bodyMedium" style={{ color: colors.onSecondaryContainer }}>{sentence}</Text>
            <Text variant="bodySmall" style={{ color: colors.onSecondaryContainer }}>{formatWhen(invitation.createdAt)}</Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Button mode="outlined" style={styles.button} disabled={disabled || busy} onPress={onDecline}>Decline</Button>
          <Button mode="contained" style={styles.button} loading={busy} disabled={disabled || busy} onPress={onAccept}>Accept</Button>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, borderWidth: 1 },
  content: { padding: 20, gap: 16 },
  top: { flexDirection: 'row', gap: 14 },
  icon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 4 },
  heading: { fontFamily: fonts.bold },
  actions: { flexDirection: 'row', gap: 12 },
  button: { flex: 1, borderRadius: 14 },
});
