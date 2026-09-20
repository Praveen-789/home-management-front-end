// Mirrors the backend permission matrix so the UI only offers actions the API will accept.
// The backend stays the authority; these checks never replace its own.

export const HOUSEHOLD_ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const;
export type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number];

export const ASSIGNABLE_ROLES = ['ADMIN', 'MEMBER'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const ROLE_LABELS: Record<HouseholdRole, string> = { OWNER: 'Owner', ADMIN: 'Admin', MEMBER: 'Member' };

export function isHouseholdRole(value: unknown): value is HouseholdRole {
  return HOUSEHOLD_ROLES.includes(value as HouseholdRole);
}

export function isAssignableRole(value: unknown): value is AssignableRole {
  return ASSIGNABLE_ROLES.includes(value as AssignableRole);
}

// Owners and admins may manage members at all.
export function canManageMembers(actor: HouseholdRole): boolean {
  return actor !== 'MEMBER';
}

// Roles the actor may hand out when inviting a member or changing one. Cancelling a pending
// invitation follows the same rule against the invitation's role.
export function canAssignRole(actor: HouseholdRole, role: AssignableRole): boolean {
  return actor === 'OWNER' || (actor === 'ADMIN' && role === 'MEMBER');
}

export function assignableRoles(actor: HouseholdRole): AssignableRole[] {
  return ASSIGNABLE_ROLES.filter((role) => canAssignRole(actor, role));
}

// Whether the actor may change or remove a member who currently holds `target`.
export function canManageMember(actor: HouseholdRole, target: HouseholdRole): boolean {
  return target !== 'OWNER' && (actor === 'OWNER' || (actor === 'ADMIN' && target === 'MEMBER'));
}

export function canChangeRole(actor: HouseholdRole, target: HouseholdRole, role: AssignableRole): boolean {
  return canManageMember(actor, target) && canAssignRole(actor, role);
}

// The backend refuses self-removal for every role.
export function canRemoveMember(actor: HouseholdRole, target: HouseholdRole, isSelf: boolean): boolean {
  return !isSelf && canManageMember(actor, target);
}
