import { create } from 'zustand';
import * as householdsApi from '@/api/households';
import type { Household, Member } from '@/api/households';
import { uploadWithTicket, type ImageFile } from '@/api/images';
import type { AssignableRole } from '@/lib/household-permissions';
import { useAuthStore } from '@/stores/auth-store';
import { withToken } from '@/stores/with-token';

export { SESSION_EXPIRED } from '@/stores/with-token';

type HouseholdState = {
  // null until the first successful load, so screens can tell "loading" from "none".
  households: Household[] | null;
  membersByHousehold: Record<string, Member[]>;
  loadHouseholds: () => Promise<void>;
  createHousehold: (name: string) => Promise<Household>;
  loadMembers: (householdId: string) => Promise<void>;
  updateMemberRole: (householdId: string, userId: string, role: AssignableRole) => Promise<Member>;
  removeMember: (householdId: string, userId: string) => Promise<void>;
  // For owners and admins. Both replace the household in the list with the backend's answer.
  changePicture: (householdId: string, file: ImageFile) => Promise<void>;
  removePicture: (householdId: string) => Promise<void>;
  reset: () => void;
};

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
  updateMemberRole: async (householdId, userId, role) => {
    const updated = await withToken((token) => householdsApi.updateMemberRole(token, householdId, userId, role));
    updateMembers(householdId, (members) => members.map((member) => (member.user.id === userId ? updated : member)));
    return updated;
  },
  removeMember: async (householdId, userId) => {
    await withToken((token) => householdsApi.removeMember(token, householdId, userId));
    updateMembers(householdId, (members) => members.filter((member) => member.user.id !== userId));
  },
  changePicture: async (householdId, file) => {
    const updated = await withToken(async (token) => {
      const uploaded = await uploadWithTicket(token, householdsApi.pictureUploadsPath(householdId), file);
      return householdsApi.setHouseholdPicture(token, householdId, uploaded.publicId);
    });
    replaceHousehold(updated);
  },
  removePicture: async (householdId) => {
    replaceHousehold(await withToken((token) => householdsApi.removeHouseholdPicture(token, householdId)));
  },
  reset: () => set(initialState),
}));

function replaceHousehold(updated: Household) {
  const { households } = useHouseholdStore.getState();
  if (households) useHouseholdStore.setState({ households: households.map((household) => (household.id === updated.id ? updated : household)) });
}

// Applies a change to a household's cached member list, if that list has been loaded.
function updateMembers(householdId: string, change: (members: Member[]) => Member[]) {
  const { membersByHousehold } = useHouseholdStore.getState();
  const current = membersByHousehold[householdId];
  if (current) useHouseholdStore.setState({ membersByHousehold: { ...membersByHousehold, [householdId]: change(current) } });
}

// Household data belongs to one user; drop it on sign-out or when a different user signs in.
useAuthStore.subscribe((state, previous) => {
  const user = state.session?.user;
  if (user?.id !== previous.session?.user.id) { useHouseholdStore.getState().reset(); return; }
  // The same person with a new picture: they appear in the member lists already loaded, so those
  // copies are corrected here instead of waiting for the next refresh.
  if (!user || user.avatarUrl === previous.session?.user.avatarUrl) return;
  const { membersByHousehold } = useHouseholdStore.getState();
  useHouseholdStore.setState({
    membersByHousehold: Object.fromEntries(Object.entries(membersByHousehold).map(([householdId, members]) =>
      [householdId, members.map((member) => (member.user.id === user.id ? { ...member, user: { ...member.user, avatarUrl: user.avatarUrl } } : member))])),
  });
});
