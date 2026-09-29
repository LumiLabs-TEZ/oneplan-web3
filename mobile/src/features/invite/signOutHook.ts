import { registerSignOutHook } from '@/auth/signOutHooks';

import { resetRootModalPresenter } from '@/features/shell/rootModals';
import { _resetForTests as resetFreeTrialEligibility } from '@/features/subscription/useFreeTrialEligibility';

import { pendingInvitesStore } from './pendingInvitesStore';

let installed = false;

/**
 * Clears pending trip invites — and the rest of the root-modal presenter's session state
 * (presented friend-request ids, a parked friend code, the active modal, the free-trial
 * once-per-launch "shown" flag) — before the session is torn down, so the next account never
 * inherits them.
 */
export function installInviteSignOutHook(): void {
  if (installed) return;
  installed = true;
  registerSignOutHook(async () => {
    pendingInvitesStore.reset();
    resetRootModalPresenter();
    resetFreeTrialEligibility();
  });
}
