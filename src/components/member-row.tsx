import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar, Chip, IconButton, List, Menu } from 'react-native-paper';
import type { Member } from '@/api/households';
import { ASSIGNABLE_ROLES, canChangeRole, canRemoveMember, ROLE_LABELS, type AssignableRole, type HouseholdRole } from '@/lib/household-permissions';

type Props = {
  member: Member;
  // Undefined while the caller's own membership is still loading; no actions are offered then.
  actorRole?: HouseholdRole;
  isSelf: boolean;
  disabled: boolean;
  onChangeRole: (role: AssignableRole) => void;
  onRemove: () => void;
};

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';

export default function MemberRow({ member, actorRole, isSelf, disabled, onChangeRole, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const name = member.user.name;
  const roleOptions = actorRole
    ? ASSIGNABLE_ROLES.filter((role) => role !== member.role && canChangeRole(actorRole, member.role, role))
    : [];
  const removable = !!actorRole && canRemoveMember(actorRole, member.role, isSelf);

  return (
    <List.Item
      title={isSelf ? `${name} (you)` : name}
      description={member.user.email}
      left={({ style }) => <Avatar.Text size={40} label={initials(name)} style={style} />}
      right={() => (
        <View style={styles.right}>
          <Chip compact>{ROLE_LABELS[member.role]}</Chip>
          {(roleOptions.length > 0 || removable) && (
            <Menu
              visible={open}
              onDismiss={() => setOpen(false)}
              anchor={<IconButton icon="dots-vertical" accessibilityLabel={`Manage ${name}`} disabled={disabled} onPress={() => setOpen(true)} />}>
              {roleOptions.map((role) => (
                <Menu.Item
                  key={role}
                  leadingIcon={role === 'ADMIN' ? 'shield-account' : 'account'}
                  title={`Make ${ROLE_LABELS[role].toLowerCase()}`}
                  onPress={() => { setOpen(false); onChangeRole(role); }}
                />
              ))}
              {removable && (
                <Menu.Item leadingIcon="account-remove" title="Remove from household" onPress={() => { setOpen(false); onRemove(); }} />
              )}
            </Menu>
          )}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  right: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
