import { useEffect } from 'react';

import { setInviteListener } from '@/realtime/realtimeStore';

import { pendingInvitesStore } from './pendingInvitesStore';

/**
 * Feeds `tripInviteReceived` websocket events into `pendingInvitesStore`.
 * Kept as a tiny standalone hook (rather than wiring inside the store module)
 * so `@/features/invite` never has to import `@/realtime` at module-load time —
 * avoids an import cycle with `@/realtime/useRealtime`, which also touches
 * invite state via `emitInviteReceived`.
 */
export function useInviteRealtimeBridge(): void {
  useEffect(
    () => setInviteListener((invite) => pendingInvitesStore.upsert(invite, 'websocket')),
    [],
  );
}
