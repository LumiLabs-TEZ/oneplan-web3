import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import React from 'react';

import { createApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';

import { settleCounterparty, useSettleCounterparty } from './mutations';
import { fetchSettlements, type TripSettlementSummaryDto } from './queries';

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const summary: TripSettlementSummaryDto = {
  settlements: [
    {
      counterpartyUserId: 2,
      displayName: 'Shin',
      avatarUrl: null,
      isGroup: false,
      direction: 'receive',
      totalAmount: 500,
      isSettled: true,
      items: [],
    },
  ],
};

describe('fetchSettlements', () => {
  it('GETs the settlements path', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json(summary);
      }),
    );
    await expect(fetchSettlements(5, api)).resolves.toEqual(summary);
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/expenses/settlements');
  });

  it('throws on a 403 (non-member)', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => new Response(null, { status: 403 })),
    );
    await expect(fetchSettlements(5, api)).rejects.toThrow(/403/);
  });
});

describe('settleCounterparty', () => {
  it('POSTs the counterparty body', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json(summary);
      }),
    );
    await settleCounterparty(
      5,
      { counterpartyUserId: 2, direction: 'receive', isGroup: false },
      api,
    );
    expect(calls[0]?.method).toBe('POST');
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/expenses/settlements/settle');
    expect(await calls[0]!.json()).toEqual({
      counterpartyUserId: 2,
      direction: 'receive',
      isGroup: false,
    });
  });

  it('wraps failures in ApiMutationError', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'nope' }, 403)),
    );
    await expect(
      settleCounterparty(5, { counterpartyUserId: 2, direction: 'pay' }, api),
    ).rejects.toBeInstanceOf(ApiMutationError);
  });
});

describe('useSettleCounterparty', () => {
  it('writes the fresh summary into the settlements cache and invalidates money queries', async () => {
    const client = new QueryClient({
      defaultOptions: { mutations: { gcTime: 0 }, queries: { retry: false } },
    });
    const spy = jest.spyOn(client, 'invalidateQueries');
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json(summary)),
    );
    const wrapper = ({ children }: { children: ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);

    const { result } = await renderHook(() => useSettleCounterparty(5, api), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ counterpartyUserId: 2, direction: 'receive' });
    });

    try {
      expect(client.getQueryData(keys.trips.settlements(5))).toEqual(summary);
      expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual([
        keys.trips.breakdown(5),
        keys.trips.expenses(5),
        keys.missions,
      ]);
    } finally {
      // The observer-less entry written by `setQueryData` would otherwise hold a gc timer open.
      client.clear();
    }
  });
});
