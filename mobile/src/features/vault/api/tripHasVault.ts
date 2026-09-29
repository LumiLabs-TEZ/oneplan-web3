/**
 * Whether a trip has a group vault. `TripDto` carries no `hasVault` field — iOS derives it the
 * same indirect way: `TripVaultService.hasVault(tripId:)` (`TripDetailView.swift:1309`) treats a
 * successful `GET /trips/:tripId/vault/balance` as "has a vault" and a thrown error (the endpoint
 * 404s via `TripVaultService.requireVault` server-side) as "no vault, or not loaded yet".
 *
 * `isLoading` lets a caller distinguish "confirmed no vault" from "don't know yet" — e.g.
 * `TripMenuController.confirmEndTrip` must not fall through to the classic PATCH just because the
 * check hasn't resolved; iOS never decides with an unknown vault state either.
 */
import { useVaultBalance } from '@/features/vault/api/queries';

export interface TripHasVaultState {
  hasVault: boolean;
  /** True only while an *enabled* check is still in flight — never true when `enabled: false`. */
  isLoading: boolean;
}

export function useTripHasVault(
  tripId: number,
  opts: { enabled?: boolean } = {},
): TripHasVaultState {
  const balance = useVaultBalance(tripId, opts);
  return {
    hasVault: balance.isSuccess,
    isLoading: balance.isPending && balance.fetchStatus !== 'idle',
  };
}
