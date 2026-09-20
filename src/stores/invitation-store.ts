import { create } from 'zustand';
import { isApiError } from '@/api/client';
import * as invitationsApi from '@/api/invitations';
import type { Invitation } from '@/api/invitations';
import type { AssignableRole } from '@/lib/household-permissions';
import { useAuthStore } from '@/stores/auth-store';
import { useHouseholdStore } from '@/stores/household-store';
import { withToken } from '@/stores/with-token';

export const INVITATION_GONE = 'This invitation is no longer available.';

type InvitationState = {
  // Invitations waiting for the signed-in user's answer. null until the first successful load.
  received: Invitation[] | null;
  // Pending invitations each household has sent, for the households whose list was loaded.
  sentByHousehold: Record<string, Invitation[]>;
  loadReceived: () => Promise<void>;
  accept: (invitationId: string) => Promise<void>;
  decline: (invitationId: string) => Promise<void>;
  loadSent: (householdId: string) => Promise<void>;
  invite: (householdId: string, email: string, role: AssignableRole) => Promise<Invitation>;
  cancel: (householdId: string, invitationId: string) => Promise<void>;
  reset: () => void;
};

const initialState = { received: null, sentByHousehold: {} };

export const useInvitationStore = create<InvitationState>((set, get) => ({
  ...initialState,
  loadReceived: async () => {
    const received = await withToken(invitationsApi.listMyInvitations);
    set({ received });
  },
  // Accepting makes the user a member, so the household list is reloaded to show the new home.
  // The user has joined even if that reload fails, so its failure is not reported as one.
  accept: async (invitationId) => {
    await answer(invitationId, invitationsApi.acceptInvitation);
    await useHouseholdStore.getState().loadHouseholds().catch(() => {});
  },
  decline: (invitationId) => answer(invitationId, invitationsApi.declineInvitation),
  loadSent: async (householdId) => {
    const invitations = await withToken((token) => invitationsApi.listHouseholdInvitations(token, householdId));
    set({ sentByHousehold: { ...get().sentByHousehold, [householdId]: invitations } });
  },
  invite: async (householdId, email, role) => {
    const invitation = await withToken((token) => invitationsApi.inviteMember(token, householdId, email, role));
    // The list is newest first, matching the backend's order.
    const current = get().sentByHousehold[householdId];
    if (current) set({ sentByHousehold: { ...get().sentByHousehold, [householdId]: [invitation, ...current] } });
    return invitation;
  },
  cancel: async (householdId, invitationId) => {
    try {
      await withToken((token) => invitationsApi.cancelInvitation(token, householdId, invitationId));
    } catch (error) {
      // Already answered or cancelled elsewhere: the goal is met, so drop the row instead of failing.
      if (!(isApiError(error) && error.status === 404)) throw error;
    }
    const current = get().sentByHousehold[householdId];
    if (current) set({ sentByHousehold: { ...get().sentByHousehold, [householdId]: current.filter((item) => item.id !== invitationId) } });
  },
  reset: () => set(initialState),
}));

// Sends the user's answer and drops the invitation from their list. A 404 means it was cancelled
// or answered elsewhere: it leaves the list too, and the caller gets a message that says so.
async function answer(invitationId: string, send: (token: string, invitationId: string) => Promise<void>) {
  const forget = () => {
    const { received } = useInvitationStore.getState();
    if (received) useInvitationStore.setState({ received: received.filter((item) => item.id !== invitationId) });
  };
  try {
    await withToken((token) => send(token, invitationId));
  } catch (error) {
    if (!(isApiError(error) && error.status === 404)) throw error;
    forget();
    throw new Error(INVITATION_GONE);
  }
  forget();
}

// Invitations belong to one user; drop them on sign-out or when a different user signs in.
useAuthStore.subscribe((state, previous) => {
  if (state.session?.user.id !== previous.session?.user.id) useInvitationStore.getState().reset();
});
