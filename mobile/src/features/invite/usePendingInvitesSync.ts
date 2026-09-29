import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAuthStore } from '@/auth/authStore';

import { fetchPendingInvites } from './api/queries';
import { pendingInvitesStore } from './pendingInvitesStore';

/**
 * Refreshes pending trip invites from `GET /trips/invites/pending` whenever the
 * user is signed in or the app returns to the foreground
 * (`RealtimeService.refreshPendingTripInvites`). The websocket already streams
 * new invites live; this covers ones received while the app was killed or
 * backgrounded. Best-effort — failures are swallowed, mirroring the swift `print`.
 */
export function usePendingInvitesSync(): void {
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status !== 'authed') return;

    const sync = () => {
      void fetchPendingInvites()
        .then((invites) => {
          for (const invite of invites) pendingInvitesStore.upsert(invite, 'api');
        })
        .catch(() => {
          // best-effort — websocket + the next foreground event will retry
        });
    };

    sync();
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') sync();
    });
    return () => sub.remove();
  }, [status]);
}
