/**
 * End-trip consensus API — port of `ios/OnePlan/OnePlan/Services/TripEndConsensusService.swift`.
 * Owned by Wave D (`docs/web3/rn-ui-parity-inventory.md` §Wave D). The cash-debt confirm mutation
 * also lives here (Wave D's own endpoint); every other vault read (balance/settlement/history) is
 * Wave A's `features/vault/api/queries.ts` — import those instead of re-deriving them here.
 *
 * `requestTripEndIdempotent` folds in the 409-already-pending recovery iOS's `TripDetailService`
 * wraps around `TripEndConsensusService.requestEnd` (fetch the existing request instead of
 * surfacing the conflict as an error) so any caller — this wave's Review screen, or a later
 * Wave E entry point — gets the same idempotent behaviour without re-deriving it.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';
import type { components } from '@/api/schema';
import { invalidateTrip } from '@/features/trip/api/mutations';
import { HttpError } from '@/features/trip/api/queries';

export type TripEndRequestDto = components['schemas']['TripEndRequestDto'];
export type TripEndReviewDto = components['schemas']['TripEndReviewDto'];
export type TripEndVoteDecision = components['schemas']['TripEndVoteDecision'];
export type TripEndVoteMemberDto = components['schemas']['TripEndVoteMemberDto'];
export type CashDebtDto = components['schemas']['CashDebtDto'];

// --- reads --------------------------------------------------------------

/** 404 (no end request for this trip) resolves to `null` rather than throwing. */
export async function fetchTripEndRequest(
  tripId: number,
  api: ApiClient = defaultApi,
): Promise<TripEndRequestDto | null> {
  const { data, error, response } = await api.GET('/trips/{id}/end-request', {
    params: { path: { id: tripId } },
  });
  if (response.status === 404) return null;
  if (error !== undefined || !response.ok || data === undefined) {
    throw new HttpError(`GET /trips/${tripId}/end-request`, response.status, error ?? null);
  }
  return data;
}

export function useTripEndRequest(tripId: number, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.vault.endRequest(tripId),
    queryFn: () => fetchTripEndRequest(tripId),
    enabled: (opts.enabled ?? true) && Number.isFinite(tripId) && tripId > 0,
    meta: { persist: false },
  });
}

export async function fetchTripEndReview(
  tripId: number,
  api: ApiClient = defaultApi,
): Promise<TripEndReviewDto> {
  const { data, error, response } = await api.GET('/trips/{id}/end-request/review', {
    params: { path: { id: tripId } },
  });
  if (error !== undefined || !response.ok || data === undefined) {
    throw new HttpError(
      `GET /trips/${tripId}/end-request/review`,
      response.status,
      error ?? null,
    );
  }
  return data;
}

export function useTripEndReview(tripId: number, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: keys.vault.endReview(tripId),
    queryFn: () => fetchTripEndReview(tripId),
    enabled: (opts.enabled ?? true) && Number.isFinite(tripId) && tripId > 0,
    meta: { persist: false },
  });
}

// --- mutations ------------------------------------------------------------

async function requestTripEnd(
  tripId: number,
  api: ApiClient = defaultApi,
): Promise<TripEndRequestDto> {
  const { data, error, response } = await api.POST('/trips/{id}/end-request', {
    params: { path: { id: tripId } },
  });
  if (error || !data) throw new ApiMutationError(response.status, error);
  return data;
}

/**
 * Creator starts (or restarts after a deny) the end-trip vote. A 409 means a request is already
 * pending — instead of surfacing that as an error, fetch and return it so the caller lands on the
 * same Review/Waiting screen either way (Swift: `TripDetailService` wraps
 * `TripEndConsensusService.requestEnd` the same way; ported here since Wave D owns this client).
 */
export async function requestTripEndIdempotent(
  tripId: number,
  api: ApiClient = defaultApi,
): Promise<TripEndRequestDto> {
  try {
    return await requestTripEnd(tripId, api);
  } catch (err) {
    if (err instanceof ApiMutationError && err.status === 409) {
      const existing = await fetchTripEndRequest(tripId, api);
      if (existing) return existing;
    }
    throw err;
  }
}

export function useRequestTripEnd(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => requestTripEndIdempotent(tripId, api),
    onSuccess: (data) => {
      queryClient.setQueryData(keys.vault.endRequest(tripId), data);
    },
  });
}

export async function castTripEndVote(
  tripId: number,
  decision: TripEndVoteDecision,
  api: ApiClient = defaultApi,
): Promise<TripEndRequestDto> {
  const { data, error, response } = await api.POST('/trips/{id}/end-request/vote', {
    params: { path: { id: tripId } },
    body: { decision },
  });
  // This op declares only a 200 response, so `error`'s type is `never` — checking it would make
  // TS treat the branch as unreachable and collapse `response` to `never` too (a real gotcha:
  // `if (error)` on a no-error-schema op nukes every variable's type inside the block).
  if (!data) throw new ApiMutationError(response.status, error);
  return data;
}

export function useCastTripEndVote(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (decision: TripEndVoteDecision) => castTripEndVote(tripId, decision, api),
    onSuccess: (data) => {
      queryClient.setQueryData(keys.vault.endRequest(tripId), data);
      // A unanimous approve flips Trip.status to ENDED server-side outside of `updateTrip` (the
      // classic PATCH path), so the cached trip detail would otherwise stay stale ONGOING —
      // realtime `tripEnded` catches up eventually, but the caller's own vote shouldn't wait on it.
      if (data.status === 'APPROVED') void invalidateTrip(queryClient, tripId);
    },
  });
}

export async function confirmVaultCashDebt(
  tripId: number,
  fromUserId: number,
  api: ApiClient = defaultApi,
): Promise<void> {
  const { error, response } = await api.POST('/trips/{tripId}/vault/settlement/cash/confirm', {
    params: { path: { tripId } },
    body: { fromUserId },
  });
  if (error || !response.ok) throw new ApiMutationError(response.status, error);
}

export function useConfirmVaultCashDebt(tripId: number, api: ApiClient = defaultApi) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fromUserId: number) => confirmVaultCashDebt(tripId, fromUserId, api),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.vault.settlement(tripId) }),
  });
}
