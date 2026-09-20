import type { User } from '@/api/auth';
import { apiRequest } from '@/api/client';
import { isAssignableRole, type AssignableRole } from '@/lib/household-permissions';

// A pending invitation, as both the invited user and the household see it. It exists only while
// pending: accepting turns it into a membership, and declining or cancelling deletes it.
export type Invitation = {
  id: string;
  role: AssignableRole;
  createdAt: string;
  household: { id: string; name: string };
  invitedUser: User;
  invitedBy: User;
};

const unexpectedResponse = () => new Error('Unexpected response from HomeHub. Please try again.');
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isUser = (value: unknown): value is User =>
  isRecord(value) && typeof value.id === 'string' && !!value.id && typeof value.name === 'string' && typeof value.email === 'string';

export function isInvitation(value: unknown): value is Invitation {
  return isRecord(value) && typeof value.id === 'string' && !!value.id && isAssignableRole(value.role) &&
    typeof value.createdAt === 'string' && isRecord(value.household) && typeof value.household.id === 'string' &&
    !!value.household.id && typeof value.household.name === 'string' && isUser(value.invitedUser) && isUser(value.invitedBy);
}

const householdInvitationsPath = (householdId: string) => `/households/${encodeURIComponent(householdId)}/invitations`;
const myInvitationPath = (invitationId: string) => `/invitations/${encodeURIComponent(invitationId)}`;

function readInvitations(data: unknown): Invitation[] {
  const invitations = isRecord(data) ? data.invitations : undefined;
  if (!Array.isArray(invitations) || !invitations.every(isInvitation)) throw unexpectedResponse();
  return invitations;
}

// ---- The invited user's side ----

export async function listMyInvitations(token: string): Promise<Invitation[]> {
  return readInvitations(await apiRequest('/invitations', { token }));
}

// 404 means the invitation was cancelled or already answered; 409 means its sender can no longer invite.
export async function acceptInvitation(token: string, invitationId: string): Promise<void> {
  await apiRequest(`${myInvitationPath(invitationId)}/accept`, { method: 'POST', token });
}

export async function declineInvitation(token: string, invitationId: string): Promise<void> {
  await apiRequest(`${myInvitationPath(invitationId)}/decline`, { method: 'POST', token });
}

// ---- The household's side ----

export async function listHouseholdInvitations(token: string, householdId: string): Promise<Invitation[]> {
  return readInvitations(await apiRequest(householdInvitationsPath(householdId), { token }));
}

// The backend resolves the email to an existing account; unknown emails return 404 "User not found".
export async function inviteMember(token: string, householdId: string, email: string, role: AssignableRole): Promise<Invitation> {
  const data = await apiRequest(householdInvitationsPath(householdId), { method: 'POST', body: { email, role }, token });
  const invitation = isRecord(data) ? data.invitation : undefined;
  if (!isInvitation(invitation)) throw unexpectedResponse();
  return invitation;
}

export async function cancelInvitation(token: string, householdId: string, invitationId: string): Promise<void> {
  await apiRequest(`${householdInvitationsPath(householdId)}/${encodeURIComponent(invitationId)}`, { method: 'DELETE', token });
}
