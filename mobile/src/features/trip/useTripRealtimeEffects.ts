/**
 * Reacts to the realtime `tripEnded` / `tripDeleted` / `tripMemberRemoved` effects while the trip
 * detail screen is mounted — port of the `.tripRealtimeEnded` / `.tripRealtimeDeleted` /
 * `tripMemberRemoved` observers in `TripDetailView.swift`. `realtimeStore.consumeEffect` makes
 * each effect one-shot, so only the mounted screen for that trip acts on it.
 */
import { router } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { consumeSelfLeave, useRealtimeStore } from '@/realtime/realtimeStore';
import { useWeb3Enabled } from '@/features/vault/web3Flag';

export type TripRealtimeAction = 'openEnd' | 'announceDeleted' | 'leftByRemoval' | null;

/**
 * Pure decision: `tripEnded` always routes the member to the trip-end recap. `tripDeleted`
 * is only announced to *other* members — the creator triggered it and already navigated away.
 * `tripMemberRemoved` only acts when the removed `userId` is the current user — everyone else's
 * device just refetches the member list (handled by `invalidationFor`, not here).
 */
export function tripRealtimeAction(input: {
  ended: boolean;
  deleted: boolean;
  removedMe: boolean;
  isCreator: boolean;
}): TripRealtimeAction {
  if (input.ended) return 'openEnd';
  if (input.deleted && !input.isCreator) return 'announceDeleted';
  if (input.removedMe) return 'leftByRemoval';
  return null;
}

export function useTripRealtimeEffects(
  tripId: number,
  isCreator: boolean,
  currentUserId?: number,
): void {
  const { t } = useTranslation();
  // `tripMemberRemoved` (and its leave-the-screen navigation) is web3-only: flag off = develop.
  const web3Enabled = useWeb3Enabled(tripId);
  const endedAt = useRealtimeStore((s) => s.lastTripEnded);
  const deletedAt = useRealtimeStore((s) => s.lastTripDeleted);
  const memberRemovedAt = useRealtimeStore((s) => s.lastTripMemberRemoved);

  useEffect(() => {
    const { consumeEffect } = useRealtimeStore.getState();
    const ended = endedAt?.tripId === tripId && consumeEffect('tripEnded', tripId);
    const deleted = deletedAt?.tripId === tripId && consumeEffect('tripDeleted', tripId);
    let removedMe =
      web3Enabled &&
      memberRemovedAt?.tripId === tripId &&
      memberRemovedAt.userId === currentUserId &&
      consumeEffect('tripMemberRemoved', tripId);
    // I left on my own through the classic sheet, which already navigated: don't do it twice.
    if (removedMe && consumeSelfLeave(tripId)) removedMe = false;
    const action = tripRealtimeAction({ ended, deleted, removedMe, isCreator });

    if (action === 'openEnd') {
      router.replace({
        pathname: '/trip/[tripId]/end',
        params: { tripId: String(tripId), mode: 'flow' },
      });
    } else if (action === 'announceDeleted') {
      Alert.alert(t('Trip deleted'));
      router.dismissTo('/(tabs)/home');
    } else if (action === 'leftByRemoval') {
      router.dismissTo('/(tabs)/home');
    }
  }, [endedAt, deletedAt, memberRemovedAt, tripId, isCreator, currentUserId, web3Enabled, t]);
}
