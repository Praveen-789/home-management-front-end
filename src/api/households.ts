import type { User } from '@/api/auth';
import { apiRequest } from '@/api/client';
import { isHouseholdRole, type AssignableRole, type HouseholdRole } from '@/lib/household-permissions';

// A household as the list endpoint returns it: `role` is the caller's own role in it.
export type Household = { id: string; name: string; createdAt: string; role: HouseholdRole };
export type Member = { id: string; role: HouseholdRole; user: User };

const unexpectedResponse = () => new Error('Unexpected response from HomeHub. Please try again.');
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export function isHousehold(value: unknown): value is Household {
  return isRecord(value) && typeof value.id === 'string' && !!value.id && typeof value.name === 'string' &&
    typeof value.createdAt === 'string' && isHouseholdRole(value.role);
}

export function isMember(value: unknown): value is Member {
  if (!isRecord(value) || typeof value.id !== 'string' || !isHouseholdRole(value.role) || !isRecord(value.user)) return false;
  const { user } = value;
  return typeof user.id === 'string' && !!user.id && typeof user.name === 'string' && typeof user.email === 'string';
}

const membersPath = (householdId: string) => `/households/${encodeURIComponent(householdId)}/members`;
const memberPath = (householdId: string, userId: string) => `${membersPath(householdId)}/${encodeURIComponent(userId)}`;

export async function listHouseholds(token: string): Promise<Household[]> {
  const data = await apiRequest('/households', { token });
  const households = isRecord(data) ? data.households : undefined;
  if (!Array.isArray(households) || !households.every(isHousehold)) throw unexpectedResponse();
  return households;
}

export async function createHousehold(token: string, name: string): Promise<Household> {
  const data = await apiRequest('/households', { method: 'POST', body: { name }, token });
  const household = isRecord(data) ? data.household : undefined;
  // The create response is the full record without a role; the creator is always the owner.
  if (!isRecord(household) || typeof household.id !== 'string' || !household.id ||
    typeof household.name !== 'string' || typeof household.createdAt !== 'string') throw unexpectedResponse();
  return { id: household.id, name: household.name, createdAt: household.createdAt, role: 'OWNER' };
}

export async function listMembers(token: string, householdId: string): Promise<Member[]> {
  const data = await apiRequest(membersPath(householdId), { token });
  const members = isRecord(data) ? data.members : undefined;
  if (!Array.isArray(members) || !members.every(isMember)) throw unexpectedResponse();
  return members;
}

function readMember(data: unknown): Member {
  const member = isRecord(data) ? data.member : undefined;
  if (!isMember(member)) throw unexpectedResponse();
  return member;
}

export async function updateMemberRole(token: string, householdId: string, userId: string, role: AssignableRole): Promise<Member> {
  return readMember(await apiRequest(memberPath(householdId, userId), { method: 'PATCH', body: { role }, token }));
}

export async function removeMember(token: string, householdId: string, userId: string): Promise<void> {
  await apiRequest(memberPath(householdId, userId), { method: 'DELETE', token });
}
