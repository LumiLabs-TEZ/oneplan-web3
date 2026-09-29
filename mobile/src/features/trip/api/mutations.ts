/**
 * Trip mutations — create/update/delete a trip, remove a member (or leave), join by invite code.
 * Errors are `ApiMutationError` so callers can read structured bodies (e.g. `updateTrip`'s 400
 * `StartTripConflictErrorDto.memberNames`). Success invalidates the trip detail + trips list so
 * Home and the trip screen refresh.
 */
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';
import type { components } from '@/api/schema';
import { invalidatePlanItems } from '@/features/plan/api/mutations';

type CreateTripDto = components['schemas']['CreateTripDto'];
type UpdateTripDto = components['schemas']['UpdateTripDto'];
type TripDto = components['schemas']['TripDto'];
type LeaveSettlementDto = components['schemas']['LeaveSettlementDto'];

export async function createTrip(
  body: CreateTripDto,
  api: ApiClient = defaultApi,
): Promise<TripDto> {
  // `createTrip`'s spec only declares the 201 response, so openapi-fetch types `data` as always
  // present — widen before the runtime failure check so the error branch still type-checks.
  const { data, error, response } = (await api.POST('/trips', { body })) as {
    data?: TripDto;
    error?: unknown;
    response: Response;
  };
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data;
}

export async function updateTrip(
  tripId: number,
  body: UpdateTripDto,
  api: ApiClient = defaultApi,
): Promise<TripDto> {
  const { data, error, response } = await api.PATCH('/trips/{id}', {
    params: { path: { id: tripId } },
    body,
  });
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data;
}

export async function deleteTrip(tripId: number, api: ApiClient = defaultApi): Promise<void> {
  const { error, response } = await api.DELETE('/trips/{id}', {
    params: { path: { id: tripId } },
  });
  if (error || !response.ok) throw new ApiMutationError(response.status, error);
}

/**
 * Deletes one plan item (204). Used by the trip-dates flow when shrinking the schedule orphans
 * the plan items on the trailing days (`scheduleGuard.lostPlanItems`).
 */
export async function deletePlanItem(
  tripId: number,
  planItemId: number,
  api: ApiClient = defaultApi,
): Promise<void> {
  const { error, response } = await api.DELETE('/trips/{tripId}/plan-items/{id}', {
    params: { path: { tripId, id: planItemId } },
  });
  if (error || !response.ok) throw new ApiMutationError(response.status, error);
}

export async function removeMember(
  tripId: number,
  userId: number,
  api: ApiClient = defaultApi,
): Promise<LeaveSettlementDto> {
  const { data, error, response } = await api.DELETE('/trips/{id}/members/{userId}', {
    params: { path: { id: tripId, userId } },
  });
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data;
}

export async function joinTrip(inviteCode: string, api: ApiClient = defaultApi): Promise<TripDto> {
  const { data, error, response } = await api.POST('/trips/join/{inviteCode}', {
    params: { path: { inviteCode } },
  });
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data;
}

/** The trips list, at every status filter. */
export function invalidateTripLists(queryClient: QueryClient): Promise<unknown> {
  return queryClient.invalidateQueries({ queryKey: ['trips', 'list'] });
}

/** A trip's detail + every sub-resource, plus the trips list (name/status/dates surface there). */
export function invalidateTrip(queryClient: QueryClient, tripId: number): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.trips.detail(tripId) }),
    invalidateTripLists(queryClient),
  ]);
}

export function useCreateTrip(api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTripDto) => createTrip(body, api),
    onSuccess: () => invalidateTripLists(queryClient),
  });
}

export function useUpdateTrip(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateTripDto) => updateTrip(tripId, body, api),
    onSuccess: (data, body) => {
      queryClient.setQueryData(keys.trips.detail(tripId), data);
      // A currency change converts every budget/expense/share server-side — refetch the slices.
      if (body.currency !== undefined || body.localCurrencies !== undefined) {
        return invalidateTrip(queryClient, tripId);
      }
      // Otherwise the response IS the new detail. Callers whose change reaches sub-resources
      // (dates → plan items, start/end → status-driven screens) invalidate after their own flow.
      return invalidateTripLists(queryClient);
    },
  });
}

export function useDeleteTrip(api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tripId: number) => deleteTrip(tripId, api),
    onSuccess: (_data, tripId) => {
      queryClient.removeQueries({ queryKey: keys.trips.detail(tripId) });
      return invalidateTripLists(queryClient);
    },
  });
}

export interface DeletePlanItemOptions {
  /**
   * Skip the per-call plan-items invalidation. Set it when deleting a batch (the trip-dates
   * flow removes every item on the trailing days), then invalidate once after the loop —
   * otherwise each delete triggers its own refetch of a list that is still shrinking.
   */
  skipInvalidate?: boolean;
}

export function useDeletePlanItem(
  tripId: number,
  { skipInvalidate = false }: DeletePlanItemOptions = {},
  api: ApiClient = defaultApi,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planItemId: number) => deletePlanItem(tripId, planItemId, api),
    onSuccess: skipInvalidate ? undefined : () => invalidatePlanItems(queryClient, tripId),
  });
}

export function useRemoveMember(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => removeMember(tripId, userId, api),
    onSuccess: () => invalidateTrip(queryClient, tripId),
  });
}

export function useJoinTrip(api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteCode: string) => joinTrip(inviteCode, api),
    onSuccess: () => invalidateTripLists(queryClient),
  });
}
