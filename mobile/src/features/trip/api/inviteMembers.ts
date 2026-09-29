/**
 * Invite existing friends to a trip by user id — port of `TripService.inviteMembers`
 * (`TripInviteView.swift:53-90`, `POST /trips/{id}/invite`). Success returns the (pending)
 * `TripMemberDto[]` the server added; invalidates the trip detail so `Members` and this screen's
 * "already a member" filter pick up the new pending row.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { ApiMutationError } from '@/api/mutationError';

import { invalidateTrip } from './mutations';
import type { TripMemberDto } from '../types';

export async function inviteMembers(
  tripId: number,
  userIds: number[],
  api: ApiClient = defaultApi,
): Promise<TripMemberDto[]> {
  const { data, error, response } = await api.POST('/trips/{id}/invite', {
    params: { path: { id: tripId } },
    body: { userIds },
  });
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data;
}

export function useInviteMembers(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userIds: number[]) => inviteMembers(tripId, userIds, api),
    onSuccess: () => invalidateTrip(queryClient, tripId),
  });
}
