/**
 * Pairwise settlements for the trip-end breakdown (`GET /trips/{tripId}/expenses/settlements`).
 * Keyed under the trip-detail prefix so the realtime `tripSettlementUpdated` invalidation
 * (`realtime/invalidation.ts`) refreshes it for free. Never persisted — settlement state is
 * money-critical and must not be served from a cold cache.
 */
import { useQuery } from '@tanstack/react-query';

import { api as defaultApi, type ApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import type { components } from '@/api/schema';
import { HttpError } from '@/features/trip/api/queries';

export type TripSettlementSummaryDto = components['schemas']['TripSettlementSummaryDto'];
export type CounterpartySettlementDto = components['schemas']['CounterpartySettlementDto'];
export type SettlementItemDto = components['schemas']['SettlementItemDto'];

export async function fetchSettlements(
  tripId: number,
  api: ApiClient = defaultApi,
): Promise<TripSettlementSummaryDto> {
  const { data, error, response } = await api.GET('/trips/{tripId}/expenses/settlements', {
    params: { path: { tripId } },
  });
  if (error !== undefined || !response.ok || data === undefined) {
    throw new HttpError(
      `GET /trips/${tripId}/expenses/settlements`,
      response.status,
      error ?? null,
    );
  }
  return data;
}

export function useSettlements(tripId: number, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.trips.settlements(tripId),
    queryFn: () => fetchSettlements(tripId),
    meta: { persist: false },
    enabled: (opts.enabled ?? true) && Number.isFinite(tripId) && tripId > 0,
  });
}
