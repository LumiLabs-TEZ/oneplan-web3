/**
 * Refetch the friends list and pending requests on focus if the cached data is stale (`>15s`
 * old) — same freshness bar as `useStalePlanItemsRefetch` (Phase 3), applied to the friends list
 * screen so a friend/request resolved elsewhere (another device, a deep-linked modal) shows up
 * without waiting for `refetchOnWindowFocus` (foreground-only) or a manual pull-to-refresh.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { keys } from '@/api/keys';

export const FRIENDS_STALE_MS = 15_000;

function refetchIfStale(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: readonly unknown[],
): void {
  const state = queryClient.getQueryState(queryKey);
  const age = state ? Date.now() - state.dataUpdatedAt : Infinity;
  if (age > FRIENDS_STALE_MS) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

export function useStaleFriendsRefetch(): void {
  const queryClient = useQueryClient();

  useFocusEffect(
    useCallback(() => {
      refetchIfStale(queryClient, keys.friends.all);
      refetchIfStale(queryClient, keys.friends.requests);
    }, [queryClient]),
  );
}
