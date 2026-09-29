import { createTestQueryClient } from '@/testSupport/queryClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import React from 'react';

import { keys } from '@/api/keys';

import { PLAN_ITEMS_STALE_MS, useStalePlanItemsRefetch } from './useStalePlanItemsRefetch';

// Minimal stand-in for expo-router's `useFocusEffect`: runs the effect once on mount (as if the
// screen were immediately focused) — enough to exercise the stale-check without pulling in the
// full router/navigation stack (mirrors `OrbitMapCard.test.tsx`'s mock).
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

describe('useStalePlanItemsRefetch', () => {
  it('invalidates plan items when the cached data is older than 15s', async () => {
    const qc = createTestQueryClient();
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');
    qc.setQueryData(keys.trips.planItems(5), []);
    const state = qc.getQueryState(keys.trips.planItems(5))!;
    // Backdate the cache entry past the staleness window.
    (state as { dataUpdatedAt: number }).dataUpdatedAt = Date.now() - (PLAN_ITEMS_STALE_MS + 1);

    await renderHook(() => useStalePlanItemsRefetch(5), { wrapper: makeWrapper(qc) });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.trips.planItems(5) });
  });

  it('does not invalidate when the cached data is fresh', async () => {
    const qc = createTestQueryClient();
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');
    qc.setQueryData(keys.trips.planItems(5), []);

    await renderHook(() => useStalePlanItemsRefetch(5), { wrapper: makeWrapper(qc) });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('invalidates when there is no cached data at all', async () => {
    const qc = createTestQueryClient();
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');

    await renderHook(() => useStalePlanItemsRefetch(9), { wrapper: makeWrapper(qc) });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: keys.trips.planItems(9) });
  });
});
