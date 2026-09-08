import { create } from 'zustand';
import { isApiError } from '@/api/client';
import * as householdsApi from '@/api/households';
import type { Household, Member } from '@/api/households';
import type { AssignableRole } from '@/lib/household-permissions';
import { useAuthStore } from '@/stores/auth-store';

export const SESSION_EXPIRED = 'Your session has expired. Please sign in again.';

type HouseholdState = {
  // null until the first successful load, so screens can tell "loading" from "none".
  households: Household[] | null;
  membersByHousehold: Record<string, Member[]>;
  loadHouseholds: () => Promise<void>;
  createHousehold: (name: string) => Promise<Household>;
  loadMembers: (householdId: string) => Promise<void>;
  addMember: (householdId: string, email: string, role: AssignableRole) => Promise<Member>;
  updateMemberRole: (householdId: string, userId: string, role: AssignableRole) => Promise<Member>;
  removeMember: (householdId: string, userId: string) => Promise<void>;
  reset: () => void;
};

// Runs an API call with the current token. A 401 means the backend rejected the token, so the
// session is cleared and the protected routes return the user to login.
async function withToken<Result>(call: (token: string) => Promise<Result>): Promise<Result> {
  const session = useAuthStore.getState().session;
  if (!session) throw new Error(SESSION_EXPIRED);
  try {
    return await call(session.token);
  } catch (error) {
    if (isApiError(error) && error.status === 401) {
      useAuthStore.getState().logout().catch(() => useAuthStore.setState({ session: null }));
      throw new Error(SESSION_EXPIRED);
    }
    throw error;
  }
}

const initialState = { households: null, membersByHousehold: {} };

export const useHouseholdStore = create<HouseholdState>((set, get) => ({
  ...initialState,
  loadHouseholds: async () => {
    const households = await withToken(householdsApi.listHouseholds);
    set({ households });
  },
  createHousehold: async (name) => {
    const household = await withToken((token) => householdsApi.createHousehold(token, name));
    // The list is newest first, matching the backend's order.
    set({ households: [household, ...(get().households ?? [])] });
    return household;
  },
  loadMembers: async (householdId) => {
    const members = await withToken((token) => householdsApi.listMembers(token, householdId));
    set({ membersByHousehold: { ...get().membersByHousehold, [householdId]: members } });
  },
  addMember: async (householdId, email, role) => {
    const member = await withToken((token) => householdsApi.addMember(token, householdId, email, role));
    updateMembers(householdId, (members) => [...members, member]);
    return member;
  },
  updateMemberRole: async (householdId, userId, role) => {
    const updated = await withToken((token) => householdsApi.updateMemberRole(token, householdId, userId, role));
    updateMembers(householdId, (members) => members.map((member) => (member.user.id === userId ? updated : member)));
    return updated;
  },
  removeMember: async (householdId, userId) => {
    await withToken((token) => householdsApi.removeMember(token, householdId, userId));
    updateMembers(householdId, (members) => members.filter((member) => member.user.id !== userId));
  },
  reset: () => set(initialState),
}));

// Applies a change to a household's cached member list, if that list has been loaded.
function updateMembers(householdId: string, change: (members: Member[]) => Member[]) {
  const { membersByHousehold } = useHouseholdStore.getState();
  const current = membersByHousehold[householdId];
  if (current) useHouseholdStore.setState({ membersByHousehold: { ...membersByHousehold, [householdId]: change(current) } });
}

// Household data belongs to one user; drop it on sign-out or when a different user signs in.
useAuthStore.subscribe((state, previous) => {
  if (state.session?.user.id !== previous.session?.user.id) useHouseholdStore.getState().reset();
});
