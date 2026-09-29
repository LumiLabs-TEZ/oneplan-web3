import { createTestQueryClient } from '@/testSupport/queryClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import React from 'react';

import { keys } from '@/api/keys';

import { FRIENDS_STALE_MS, useStaleFriendsRefetch } from './useStaleFriendsRefetch';

// Minimal stand-in for expo-router's `useFocusEffect`: runs the effect once on mount (as if the
// screen were immediately focused) — mirrors `useStalePlanItemsRefetch.test.ts`.
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require('react');
    useEffect(effect, [effect]);
  },
}));

function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

function backdate(qc: QueryClient, queryKey: readonly unknown[], ageMs: number) {
  const state = qc.getQueryState(queryKey)!;
  (state as { dataUpdatedAt: number }).dataUpdatedAt = Date.now() - ageMs;
}

describe('useStaleFriendsRefetch', () => {
  it('invalidates both friends and requests when stale', async () => {
    const qc = createTestQueryClient();
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');
    qc.setQueryData(keys.friends.all, []);
    qc.setQueryData(keys.friends.requests, []);
    backdate(qc, keys.friends.all, FRIENDS_STALE_MS + 1);
    backdate(qc, keys.friends.requests, FRIENDS_STALE_MS + 1);

    await renderHook(() => useStaleFriendsRefetch(), { wrapper: makeWrapper(qc) });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.friends.all });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.friends.requests });
  });

  it('does not invalidate when both are fresh', async () => {
    const qc = createTestQueryClient();
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');
    qc.setQueryData(keys.friends.all, []);
    qc.setQueryData(keys.friends.requests, []);

    await renderHook(() => useStaleFriendsRefetch(), { wrapper: makeWrapper(qc) });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('only invalidates the stale one when just one is old', async () => {
    const qc = createTestQueryClient();
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');
    qc.setQueryData(keys.friends.all, []);
    qc.setQueryData(keys.friends.requests, []);
    backdate(qc, keys.friends.requests, FRIENDS_STALE_MS + 1);

    await renderHook(() => useStaleFriendsRefetch(), { wrapper: makeWrapper(qc) });

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.friends.requests });
  });

  it('invalidates when there is no cached data at all', async () => {
    const qc = createTestQueryClient();
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');

    await renderHook(() => useStaleFriendsRefetch(), { wrapper: makeWrapper(qc) });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.friends.all });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.friends.requests });
  });
});
