/**
 * Refetch plan items on focus if the cached data is stale (`>15s` old) — mirrors the
 * pull-to-refresh freshness bar without forcing a refetch on every tab switch/detail visit.
 * Shared by the trip detail screen (Plan tab) and the plan-detail screen so both surfaces pick
 * up an edit made elsewhere (e.g. from the other screen, or the placeholder `plan/new` route)
 * without waiting for a manual pull-to-refresh.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { keys } from '@/api/keys';

export const PLAN_ITEMS_STALE_MS = 15_000;

export function useStalePlanItemsRefetch(tripId: number): void {
  const queryClient = useQueryClient();

  useFocusEffect(
    useCallback(() => {
      const state = queryClient.getQueryState(keys.trips.planItems(tripId));
      const age = state ? Date.now() - state.dataUpdatedAt : Infinity;
      if (age > PLAN_ITEMS_STALE_MS) {
        void queryClient.invalidateQueries({ queryKey: keys.trips.planItems(tripId) });
      }
    }, [queryClient, tripId]),
  );
}
