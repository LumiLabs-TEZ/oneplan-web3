import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import React from 'react';

import type { PlacePrediction, PlaceSearchProvider } from '@/native/maps/placeSearch';

import { biasKey, useSuggestedNearby, usePlaceSearch } from './usePlaceSearch';

function wrapperFor(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

/** `gcTime: 0` + `retry: false` — a pending 5-minute gc timer otherwise keeps the Jest process
 * alive well past the test run (mirrors `useDayOps.test.ts` / `settlement.test.ts`). */
function testQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
}

const PLACE: PlacePrediction = {
  placeId: 'fsq:1',
  name: 'Cafe X',
  address: '1 St',
  latitude: 10,
  longitude: 106,
  category: 'Coffee Shop',
};

function fakeProvider(results: PlacePrediction[]): PlaceSearchProvider {
  return {
    name: 'foursquare',
    attribution: null,
    search: jest.fn(async () => results),
    searchNearby: jest.fn(async () => results),
  };
}

describe('biasKey', () => {
  it('rounds coordinates to 3dp, or null with no bias', () => {
    expect(biasKey(null)).toBeNull();
    expect(biasKey({ latitude: 10.12345, longitude: 106.98765 })).toBe('10.123,106.988');
  });
});

describe('usePlaceSearch', () => {
  it('gates queries under 2 characters — tooShort, no provider call', async () => {
    const provider = fakeProvider([PLACE]);
    const qc = testQueryClient();
    const { result } = await renderHook(() => usePlaceSearch('a', null, provider), {
      wrapper: wrapperFor(qc),
    });

    await waitFor(() => expect(result.current.tooShort).toBe(true));
    expect(result.current.results).toEqual([]);
    expect(provider.search).not.toHaveBeenCalled();
  });

  it('does not flag tooShort for an empty query', async () => {
    const provider = fakeProvider([]);
    const qc = testQueryClient();
    const { result } = await renderHook(() => usePlaceSearch('', null, provider), {
      wrapper: wrapperFor(qc),
    });

    expect(result.current.tooShort).toBe(false);
    expect(result.current.results).toEqual([]);
  });

  it('debounces 300ms — rapid keystrokes collapse to one search for the settled value', async () => {
    jest.useFakeTimers();
    try {
      const provider = fakeProvider([PLACE]);
      const qc = testQueryClient();
      const { result, rerender } = await renderHook(
        ({ query }: { query: string }) => usePlaceSearch(query, null, provider),
        { wrapper: wrapperFor(qc), initialProps: { query: 'ca' } },
      );

      // `useDebouncedValue` seeds its state with the initial value, so the very first render's
      // query (already >= 2 chars) fires immediately — the debounce only gates *changes*.
      expect(provider.search).toHaveBeenCalledTimes(1);
      expect(provider.search).toHaveBeenCalledWith('ca', null, expect.anything());

      await act(async () => rerender({ query: 'caf' }));
      await act(async () => jest.advanceTimersByTimeAsync(100));
      await act(async () => rerender({ query: 'cafe' }));

      // Not yet 300ms since the last keystroke ("cafe") — no second call fired, and "caf"
      // never gets its own debounced value since "cafe" reset the timer first.
      await act(async () => jest.advanceTimersByTimeAsync(299));
      expect(provider.search).toHaveBeenCalledTimes(1);

      // Fake timers pause real-time polling too, so advance past the debounce and let the
      // resolved query promise flush within the same fake-time tick instead of using `waitFor`.
      await act(async () => jest.advanceTimersByTimeAsync(1));
      expect(provider.search).toHaveBeenCalledTimes(2);
      expect(provider.search).toHaveBeenCalledWith('cafe', null, expect.anything());

      // One more tick for the resolved `search` promise to flush into query state.
      await act(async () => jest.advanceTimersByTimeAsync(0));
      expect(result.current.results).toEqual([PLACE]);
      expect(result.current.tooShort).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('useSuggestedNearby', () => {
  it('is empty and does not call the provider without a bias', async () => {
    const provider = fakeProvider([PLACE]);
    const qc = testQueryClient();
    const { result } = await renderHook(() => useSuggestedNearby(null, provider), {
      wrapper: wrapperFor(qc),
    });

    expect(result.current).toEqual([]);
    expect(provider.searchNearby).not.toHaveBeenCalled();
  });

  it('fetches nearby restaurants/coffee/attractions once a bias exists', async () => {
    const provider = fakeProvider([PLACE]);
    const qc = testQueryClient();
    const bias = { latitude: 10, longitude: 106 };
    const { result } = await renderHook(() => useSuggestedNearby(bias, provider), {
      wrapper: wrapperFor(qc),
    });

    await waitFor(() => expect(result.current).toEqual([PLACE]));
    expect(provider.searchNearby).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(String)]),
      bias,
      10,
      expect.anything(),
    );
  });
});
