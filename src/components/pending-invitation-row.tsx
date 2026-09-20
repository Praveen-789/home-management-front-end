import { IconButton, List, useTheme } from 'react-native-paper';
import type { Invitation } from '@/api/invitations';
import { ROLE_LABELS } from '@/lib/household-permissions';
import { formatWhen } from '@/lib/notification-helpers';

type Props = { invitation: Invitation; canCancel: boolean; onCancel: () => void; disabled?: boolean };

// Someone who was invited and has not answered yet, as the household sees them.
export default function PendingInvitationRow({ invitation, canCancel, onCancel, disabled = false }: Props) {
  const { colors } = useTheme();
  const { invitedUser, invitedBy, role, createdAt } = invitation;
  const details = `Invited as ${ROLE_LABELS[role].toLowerCase()} by ${invitedBy.name} · ${formatWhen(createdAt)}`;
  return (
    <List.Item
      title={invitedUser.name}
      description={`${invitedUser.email}\n${details}`}
      descriptionNumberOfLines={3}
      accessibilityLabel={`${invitedUser.name}, ${invitedUser.email}. ${details}. Waiting for their answer.`}
      left={({ style }) => <List.Icon icon="account-clock-outline" color={colors.onSurfaceVariant} style={style} />}
      right={() => canCancel
        ? <IconButton icon="close" size={20} style={{ alignSelf: 'center', margin: 0 }} disabled={disabled} accessibilityLabel={`Cancel the invitation for ${invitedUser.name}`} onPress={onCancel} />
        : null}
    />
  );
}
