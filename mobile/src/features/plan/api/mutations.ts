/**
 * Plan-item create/update. Delete lives on `features/trip/api/mutations.ts` (`useDeletePlanItem`)
 * alongside the trip-dates batch-delete flow — both paths invalidate through `invalidatePlanItems`
 * here so Home's Today's-activities (`usePlanItems(ongoingId)`), the trip schedule and any open
 * per-day route all refresh together.
 */
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';

import type { CreatePlanItemDto, PlanItemDto, UpdatePlanItemDto } from '../types';

export async function createPlanItem(
  tripId: number,
  body: CreatePlanItemDto,
  api: ApiClient = defaultApi,
): Promise<PlanItemDto> {
  const { data, error, response } = await api.POST('/trips/{tripId}/plan-items', {
    params: { path: { tripId } },
    body,
  });
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data;
}

export async function updatePlanItem(
  tripId: number,
  id: number,
  body: UpdatePlanItemDto,
  api: ApiClient = defaultApi,
): Promise<PlanItemDto> {
  const { data, error, response } = await api.PATCH('/trips/{tripId}/plan-items/{id}', {
    params: { path: { tripId, id } },
    body,
  });
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data;
}

/**
 * Plan items list/detail (the list-key prefix also covers `keys.trips.planItem` detail entries)
 * plus every day's route for the trip — both derive from the plan-item set.
 */
export function invalidatePlanItems(queryClient: QueryClient, tripId: number): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.trips.planItems(tripId) }),
    queryClient.invalidateQueries({ queryKey: keys.trips.planRoutes(tripId) }),
  ]);
}

export function useCreatePlanItem(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePlanItemDto) => createPlanItem(tripId, body, api),
    onSuccess: () => invalidatePlanItems(queryClient, tripId),
  });
}

export function useUpdatePlanItem(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdatePlanItemDto }) =>
      updatePlanItem(tripId, id, body, api),
    onSuccess: (data) => {
      queryClient.setQueryData(keys.trips.planItem(tripId, data.id), data);
      return invalidatePlanItems(queryClient, tripId);
    },
  });
}
