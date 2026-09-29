import { useEffect } from 'react';

import { useAuthStore } from '@/auth/authStore';

import { realtimeClient } from './useRealtime';

/**
 * Subscribes the socket to a trip room for as long as the screen is mounted.
 * Re-joining after a reconnect is handled by the client (it replays the joined
 * room set on every open), so this only has to track mount/unmount.
 */
export function useTripRoom(tripId: number): void {
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status !== 'authed' || !Number.isInteger(tripId) || tripId <= 0) return;
    const client = realtimeClient();
    client.joinTripRoom(tripId);
    return () => client.leaveTripRoom(tripId);
  }, [status, tripId]);
}
