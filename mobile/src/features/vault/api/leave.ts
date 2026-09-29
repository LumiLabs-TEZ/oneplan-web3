/**
 * Vault-leave mutations/queries — `TripDetailService.swift`'s `announceVaultLeave` /
 * `clearVaultLeave` / `listVaultLeaveRequests` / `confirmVaultLeave` (`feat/web3-version`).
 *
 * The classic `getLeavePreview` (`@/features/trip/api/leave`) already carries every vault field
 * this feature needs (`hasVault`/`lines`/`canAnnounce`/`leaveRequestPending`/…) — it stays owned
 * by `features/trip/api/leave.ts`, not duplicated here.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';
import type { components } from '@/api/schema';
import { invalidateTrip } from '@/features/trip/api/mutations';

type VaultLeaveAnnounceResultDto = components['schemas']['VaultLeaveAnnounceResultDto'];
type VaultLeaveClearResultDto = components['schemas']['VaultLeaveClearResultDto'];
type VaultLeaveConfirmResultDto = components['schemas']['VaultLeaveConfirmResultDto'];
type VaultLeaveRequestDto = components['schemas']['VaultLeaveRequestDto'];

/** Every op below declares only its 200 response, which widens `data` to always-present in the
 * generated client (same shape as `createTrip`'s 201-only case in `trip/api/mutations.ts`) — cast
 * before the runtime failure check so the error branch still type-checks. */
type Widened<T> = { data?: T; error?: unknown; response: Response };

export async function announceVaultLeave(
  tripId: number,
  api: ApiClient = defaultApi,
): Promise<VaultLeaveAnnounceResultDto> {
  const { data, error, response } = (await api.POST('/trips/{id}/vault-leave/announce', {
    params: { path: { id: tripId } },
  })) as Widened<VaultLeaveAnnounceResultDto>;
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data;
}

export async function clearVaultLeave(
  tripId: number,
  userId: number,
  api: ApiClient = defaultApi,
): Promise<VaultLeaveClearResultDto> {
  const { data, error, response } = (await api.POST(
    '/trips/{id}/members/{userId}/vault-leave-clear',
    { params: { path: { id: tripId, userId } } },
  )) as Widened<VaultLeaveClearResultDto>;
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data;
}

export async function listVaultLeaveRequests(
  tripId: number,
  api: ApiClient = defaultApi,
): Promise<VaultLeaveRequestDto[]> {
  const { data, error, response } = (await api.GET('/trips/{id}/vault-leave/requests', {
    params: { path: { id: tripId } },
  })) as Widened<components['schemas']['VaultLeaveRequestListDto']>;
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data.items;
}

export async function confirmVaultLeave(
  tripId: number,
  userId: number,
  api: ApiClient = defaultApi,
): Promise<VaultLeaveConfirmResultDto> {
  const { data, error, response } = (await api.POST(
    '/trips/{id}/vault-leave/requests/{userId}/confirm',
    { params: { path: { id: tripId, userId } } },
  )) as Widened<VaultLeaveConfirmResultDto>;
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data;
}

/** Pending host-side leave requests, plus the leave preview they gate — refetched on realtime. */
export function invalidateVaultLeave(queryClient: QueryClient, tripId: number): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.vault.leaveRequests(tripId) }),
    queryClient.invalidateQueries({ queryKey: keys.trips.leavePreview(tripId) }),
  ]);
}

export function useVaultLeaveRequests(
  tripId: number,
  opts: { enabled?: boolean } = {},
  api: ApiClient = defaultApi,
) {
  return useQuery({
    queryKey: keys.vault.leaveRequests(tripId),
    queryFn: () => listVaultLeaveRequests(tripId, api),
    enabled: opts.enabled ?? false,
    meta: { persist: false },
  });
}

export function useAnnounceVaultLeave(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => announceVaultLeave(tripId, api),
    onSuccess: () => invalidateVaultLeave(queryClient, tripId),
  });
}

export function useClearVaultLeave(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => clearVaultLeave(tripId, userId, api),
    onSuccess: () => invalidateVaultLeave(queryClient, tripId),
  });
}

/** Removes the confirmed member — success also invalidates the trip detail's member list. */
export function useConfirmVaultLeave(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => confirmVaultLeave(tripId, userId, api),
    onSuccess: () =>
      Promise.all([invalidateVaultLeave(queryClient, tripId), invalidateTrip(queryClient, tripId)]),
  });
}
