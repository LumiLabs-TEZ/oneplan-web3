/**
 * End-trip consensus entry for every member — port of `TripDetailView.refreshEndConsensusState`
 * + its `tripEndRequestUpdated` observer (`origin/feat/web3-version`). The vault card shows
 * "Waiting for approval" while a request is pending and its tap lands on Review (not voted yet)
 * or Waiting; a request raised by someone else opens Review on its own, and a deny opens Denied.
 *
 * Realtime only invalidates `keys.vault.endRequest` (`invalidation.ts`); the routing here reacts to
 * the refetched request, and only while trip detail is focused — Review/Waiting route themselves.
 */
import { router, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { type TripEndRequestDto, useTripEndRequest } from './api/endTrip';
import { resolveConsensusScreen } from './helpers/tripEndConsensus';

export type ConsensusAutoRoute = 'review' | 'denied' | null;

/**
 * Pure transition rule. Never on first sight of a request (`previous === undefined`): opening a
 * trip mid-vote must not yank the member into Review — the card's "Waiting for approval" is there.
 */
export function consensusAutoRoute(
  previous: TripEndRequestDto | null | undefined,
  next: TripEndRequestDto | null,
  myUserId: number | undefined,
): ConsensusAutoRoute {
  if (previous === undefined || !next) return null;
  const wasPending = previous?.status === 'PENDING' && previous.id === next.id;
  if (next.status === 'PENDING' && !wasPending) {
    // Whoever raised it is already on Review (`TripMenuController.endVaultTrip`).
    return next.requestedBy !== myUserId && next.myDecision == null ? 'review' : null;
  }
  if (next.status === 'DENIED' && wasPending) return 'denied';
  return null;
}

export function openConsensusScreen(tripId: number, request: TripEndRequestDto | null): void {
  const id = String(tripId);
  switch (resolveConsensusScreen(request)) {
    case 'review':
      router.push({ pathname: '/trip/[tripId]/end-review', params: { tripId: id } });
      return;
    case 'waiting':
      router.push({ pathname: '/trip/[tripId]/end-waiting', params: { tripId: id } });
      return;
    case 'denied':
      router.push({
        pathname: '/trip/[tripId]/end-denied',
        params: { tripId: id, request: JSON.stringify(request) },
      });
      return;
    case 'ended':
      router.replace({ pathname: '/trip/[tripId]/end', params: { tripId: id, mode: 'flow' } });
  }
}

export function useTripEndConsensus(
  tripId: number,
  hasVault: boolean,
  myUserId: number | undefined,
): { isPending: boolean; open: () => void } {
  const request = useTripEndRequest(tripId, { enabled: hasVault });
  const isFocused = useIsFocused();
  const data = request.isSuccess ? request.data : undefined;
  // `undefined` = not loaded yet, so the first load is never treated as a transition.
  const previous = useRef<TripEndRequestDto | null | undefined>(undefined);

  useEffect(() => {
    if (data === undefined) return;
    const route = consensusAutoRoute(previous.current, data, myUserId);
    previous.current = data;
    if (!isFocused || route === null) return;
    if (route === 'review') openConsensusScreen(tripId, data);
    else
      router.push({
        pathname: '/trip/[tripId]/end-denied',
        params: { tripId: String(tripId), request: JSON.stringify(data) },
      });
  }, [data, isFocused, myUserId, tripId]);

  const { refetch } = request;
  const open = useCallback(() => {
    void refetch().then((result) => openConsensusScreen(tripId, result.data ?? null));
  }, [refetch, tripId]);

  return { isPending: data?.status === 'PENDING', open };
}
