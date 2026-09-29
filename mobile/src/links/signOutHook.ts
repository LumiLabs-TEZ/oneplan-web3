import { registerSignOutHook } from '@/auth/signOutHooks';

import { pendingLinkStore } from './pendingLinkStore';

let installed = false;

/** Clears the parked deep link before the session is torn down. */
export function installLinksSignOutHook(): void {
  if (installed) return;
  installed = true;
  registerSignOutHook(async () => {
    pendingLinkStore.clear();
  });
}
