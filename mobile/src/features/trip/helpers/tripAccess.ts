import type { TripStatus } from '../types';

export interface TripAccessInput {
  /** `undefined`/`null` while the trip is still loading. */
  status: TripStatus | null | undefined;
  /** From `useIsOnline()`. */
  online: boolean;
  /** From `useServingCached(query)` — data shown comes from the persisted cache. */
  servingCached: boolean;
}

export interface TripAccess {
  /** Offline mode is read-only (`TripDetailView.isOffline`). */
  isOffline: boolean;
  /** Every *write* affordance gates on this (`TripDetailView.canEdit`). */
  canEdit: boolean;
  /** ENDED trips hide the tab bar and are read-only. */
  tabBarEnabled: boolean;
}

/** Port of `TripDetailView.swift` `isOffline` / `allowsFinancialActions` / `canEdit`. */
export function tripAccess({ status, online, servingCached }: TripAccessInput): TripAccess {
  const isOffline = !online || servingCached;
  const allowsFinancialActions = status === 'PLANNING' || status === 'ONGOING';
  return {
    isOffline,
    canEdit: allowsFinancialActions && !isOffline,
    tabBarEnabled: status !== 'ENDED',
  };
}
