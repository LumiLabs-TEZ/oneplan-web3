import { registerSignOutHook } from '@/auth/signOutHooks';

import { realtimeStore } from './realtimeStore';
import { peekRealtimeClient } from './useRealtime';

let installed = false;

/** Drops the socket and clears realtime effects before the session is torn down. */
export function installRealtimeSignOutHook(): void {
  if (installed) return;
  installed = true;
  registerSignOutHook(async () => {
    peekRealtimeClient()?.disconnect();
    realtimeStore.reset();
  });
}
