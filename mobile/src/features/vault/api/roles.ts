/**
 * Trip member role mutation — `PATCH /trips/{id}/members/{userId}/role`
 * (`TripDetailService.setMemberRole`, `feat/web3-version`). Creator-only, server-enforced (403
 * for anyone else); the client only ever sends `CO_HOST` or `MEMBER` — `HOST` is not assignable.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { ApiMutationError } from '@/api/mutationError';
import type { components } from '@/api/schema';
import { invalidateTrip } from '@/features/trip/api/mutations';

type TripMemberDto = components['schemas']['TripMemberDto'];
export type AssignableTripMemberRole = Extract<
  components['schemas']['TripMemberRole'],
  'CO_HOST' | 'MEMBER'
>;

export async function setMemberRole(
  tripId: number,
  userId: number,
  role: AssignableTripMemberRole,
  api: ApiClient = defaultApi,
): Promise<TripMemberDto> {
  const { data, error, response } = await api.PATCH('/trips/{id}/members/{userId}/role', {
    params: { path: { id: tripId, userId } },
    body: { role },
  });
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data;
}

export function useSetMemberRole(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: number; role: AssignableTripMemberRole }) =>
      setMemberRole(tripId, userId, role, api),
    onSuccess: () => invalidateTrip(queryClient, tripId),
  });
}
