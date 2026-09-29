import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import React from 'react';

import { createApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import type { LocationPick } from '../types';

import {
  fetchRecentLocations,
  saveRecentLocation,
  useSaveRecentLocation,
  type RecentLocationDto,
} from './recentLocations';

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('fetchRecentLocations', () => {
  it('GETs /auth/me/recent-locations with the limit query param', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json([{ id: 1, name: 'Hanoi', lastViewedAt: '2026-01-01T00:00:00.000Z' }]);
      }),
    );

    const res = await fetchRecentLocations(5, api);
    expect(res).toHaveLength(1);
    expect(new URL(calls[0]!.url).pathname).toBe('/auth/me/recent-locations');
    expect(new URL(calls[0]!.url).searchParams.get('limit')).toBe('5');
  });

  it('defaults limit to 10', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json([]);
      }),
    );

    await fetchRecentLocations(undefined, api);
    expect(new URL(calls[0]!.url).searchParams.get('limit')).toBe('10');
  });

  it('throws HttpError on a non-2xx response', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'nope' }, 500)),
    );
    await expect(fetchRecentLocations(10, api)).rejects.toThrow();
  });
});

describe('saveRecentLocation', () => {
  it('POSTs the body and returns the created RecentLocationDto', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ id: 9, name: 'Da Lat', lastViewedAt: '2026-01-01T00:00:00.000Z' }, 201);
      }),
    );

    const res = await saveRecentLocation({ name: 'Da Lat' }, api);
    expect(res?.id).toBe(9);
    expect(calls[0]?.method).toBe('POST');
    expect(new URL(calls[0]!.url).pathname).toBe('/auth/me/recent-locations');
    expect(await calls[0]!.json()).toMatchObject({ name: 'Da Lat' });
  });

  it('swallows a 500 and resolves to null', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'boom' }, 500)),
    );
    const res = await saveRecentLocation({ name: 'Da Lat' }, api);
    expect(res).toBeNull();
  });

  it('swallows a network failure and resolves to null', async () => {
    const api = createApiClient('http://x', (() =>
      Promise.reject(new Error('offline'))) as typeof fetch);
    const res = await saveRecentLocation({ name: 'Da Lat' }, api);
    expect(res).toBeNull();
  });
});

describe('useSaveRecentLocation', () => {
  function wrapperFor(qc: QueryClient) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return React.createElement(QueryClientProvider, { client: qc }, children);
    };
  }

  const pick: LocationPick = {
    name: 'Da Lat Market',
    latitude: 11.94,
    longitude: 108.44,
    address: '1 Market St',
    category: 'Market',
    source: 'search',
  };

  it('fires the save without the caller awaiting it, and unshifts into the cache on success', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() =>
        json(
          {
            id: 1,
            name: 'Da Lat Market',
            address: '1 Market St',
            lastViewedAt: '2026-01-01T00:00:00.000Z',
          },
          201,
        ),
      ),
    );
    const qc = new QueryClient();
    const { result } = await renderHook(() => useSaveRecentLocation(api), {
      wrapper: wrapperFor(qc),
    });

    result.current(pick);

    try {
      await waitFor(() => {
        const cached = qc.getQueryData<RecentLocationDto[]>(keys.recentLocations);
        expect(cached?.[0]?.id).toBe(1);
      });
    } finally {
      // The observer-less entry written by `setQueryData` would otherwise hold a gc timer open.
      qc.clear();
    }
  });

  it('dedupes by name+address, moving the existing entry to the front instead of duplicating', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() =>
        json(
          {
            id: 5,
            name: 'Da Lat Market',
            address: '1 Market St',
            lastViewedAt: '2026-02-01T00:00:00.000Z',
          },
          201,
        ),
      ),
    );
    const qc = new QueryClient();
    qc.setQueryData<RecentLocationDto[]>(keys.recentLocations, [
      {
        id: 5,
        name: 'Da Lat Market',
        address: '1 Market St',
        lastViewedAt: '2026-01-01T00:00:00.000Z',
      },
      { id: 2, name: 'Other Place', address: null, lastViewedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    const { result } = await renderHook(() => useSaveRecentLocation(api), {
      wrapper: wrapperFor(qc),
    });

    result.current(pick);

    try {
      await waitFor(() => {
        const cached = qc.getQueryData<RecentLocationDto[]>(keys.recentLocations) ?? [];
        expect(cached).toHaveLength(2);
        expect(cached[0]?.id).toBe(5);
        expect(cached[0]?.lastViewedAt).toBe('2026-02-01T00:00:00.000Z');
        expect(cached[1]?.id).toBe(2);
      });
    } finally {
      qc.clear();
    }
  });

  it('swallows a failed save and never mutates the cache', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ message: 'boom' }, 500);
      }),
    );
    const qc = new QueryClient();
    const { result } = await renderHook(() => useSaveRecentLocation(api), {
      wrapper: wrapperFor(qc),
    });

    result.current(pick);
    await waitFor(() => expect(calls).toHaveLength(1));

    expect(qc.getQueryData(keys.recentLocations)).toBeUndefined();
  });
});

describe('keys.recentLocations', () => {
  it('is a stable query key', () => {
    const qc = new QueryClient();
    expect(() => qc.getQueryData(keys.recentLocations)).not.toThrow();
  });
});
