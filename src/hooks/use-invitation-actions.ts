import { errorMessage } from '@/lib/errors';
import { useInvitationStore } from '@/stores/invitation-store';
import { useCallback, useState } from 'react';

// Accept and decline for the signed-in user's invitations, shared by the household list and the
// notification inbox. `report` receives the outcome, success or failure, as text for a snackbar.
// Both actions resolve to whether they succeeded.
export default function useInvitationActions(report: (message: string) => void) {
  const [busyId, setBusyId] = useState('');

  const run = useCallback(async (invitationId: string, accepted: boolean, householdName?: string) => {
    setBusyId(invitationId);
    const household = householdName ?? 'the household';
    try {
      const { accept, decline } = useInvitationStore.getState();
      await (accepted ? accept(invitationId) : decline(invitationId));
      report(accepted ? `You joined ${household}.` : `You declined the invitation to ${household}.`);
      return true;
    } catch (error) {
      report(errorMessage(error, accepted ? 'Could not accept this invitation. Please try again.' : 'Could not decline this invitation. Please try again.'));
      return false;
    } finally { setBusyId(''); }
  }, [report]);

  const accept = useCallback((invitationId: string, householdName?: string) => run(invitationId, true, householdName), [run]);
  const decline = useCallback((invitationId: string, householdName?: string) => run(invitationId, false, householdName), [run]);
  return { busyId, accept, decline };
}
