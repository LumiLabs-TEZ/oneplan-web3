import { useRef } from 'react';
import { fetchTrip, fetchPlanItems } from '@/features/trip/api/queries';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ApiClient, api as defaultApi } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';
import type { components } from '@/api/schema';
import { unwrap } from './queries';

export async function acquireListing(
  id: number,
  method: 'pro' | 'spark',
  api: ApiClient = defaultApi,
) {
  const result =
    method === 'spark'
      ? await api.POST('/missions/redeem', { body: { itemId: 'market_unlock', listingId: id } })
      : await api.POST('/marketplace/listings/{id}/apply', { params: { path: { id } } });
  // A concurrent acquire (or a lost response) is recoverable only after confirming ownership.
  if (!result.response.ok && result.response.status !== 409)
    throw new ApiMutationError(result.response.status, result.error);
  const status = unwrap(
    await api.GET('/marketplace/listings/{id}/applied', { params: { path: { id } } }),
  );
  if (!status.applied || !status.acquisitionId)
    throw new ApiMutationError(result.response.status, result.error);
  return status.acquisitionId;
}
export function useAcquireListing(id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (method: 'pro' | 'spark') => acquireListing(id, method),
    retry: false,
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: keys.market.all }),
        client.invalidateQueries({ queryKey: keys.missions }),
      ]);
    },
  });
}
export function useApplyPlan() {
  const client = useQueryClient();
  const createdTrips = useRef(new Map<number, number>());
  async function refreshTrip(id: number) {
    await client.invalidateQueries({ queryKey: keys.trips.detail(id), refetchType: 'none' });
    await Promise.all([
      client.fetchQuery({
        queryKey: keys.trips.detail(id),
        queryFn: () => fetchTrip(id),
        staleTime: 0,
      }),
      client.fetchQuery({
        queryKey: keys.trips.planItems(id),
        queryFn: () => fetchPlanItems(id),
        staleTime: 0,
      }),
    ]);
  }
  return useMutation({
    retry: false,
    mutationFn: async (input: {
      acquisitionId: number;
      listingId?: number | null;
      tripId?: number;
    }) => {
      if (input.tripId) {
        const result = await defaultApi.POST(
          '/trips/{tripId}/plan-items/apply-acquisition/{acquisitionId}',
          {
            params: { path: { tripId: input.tripId, acquisitionId: input.acquisitionId } },
          },
        );
        if (!result.response.ok && result.response.status !== 409)
          throw new ApiMutationError(result.response.status, result.error);
        await refreshTrip(input.tripId);
        void client.invalidateQueries({ queryKey: keys.missions });
        return input.tripId;
      }
      if (!input.listingId)
        throw new ApiMutationError(404, { message: 'Source listing is no longer available' });
      let tripId = createdTrips.current.get(input.acquisitionId);
      if (!tripId) {
        const trip = unwrap(
          await defaultApi.POST('/marketplace/listings/{id}/create-trip', {
            params: { path: { id: input.listingId } },
          }),
        );
        tripId = trip.id;
        createdTrips.current.set(input.acquisitionId, tripId);
      }
      await refreshTrip(tripId);
      await client.invalidateQueries({ queryKey: keys.trips.list() });
      // Both branches complete the apply_plan mission server-side.
      void client.invalidateQueries({ queryKey: keys.missions });
      return tripId;
    },
  });
}
export async function requestPlan(
  body: components['schemas']['CreateTripRequestDto'],
  api: ApiClient = defaultApi,
) {
  return unwrap(await api.POST('/trip-requests', { body }));
}
export function useRequestPlan() {
  return useMutation({
    retry: false,
    mutationFn: (body: components['schemas']['CreateTripRequestDto']) => requestPlan(body),
  });
}
