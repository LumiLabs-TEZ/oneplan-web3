import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import React from 'react';

import { createApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';

import {
  createBudget,
  deleteBudget,
  markBudgetPayment,
  updateBudget,
  useMarkPayment,
} from './mutations';

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('budget mutations', () => {
  it('POSTs the create body and returns the budget', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ id: 4, name: 'Hotel' }, 201);
      }),
    );
    const res = await createBudget(5, { name: 'Hotel', amount: 100, scope: 'GROUP' }, api);
    expect(res.id).toBe(4);
    expect(calls[0]?.method).toBe('POST');
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/budgets');
    expect(await calls[0]!.json()).toMatchObject({ name: 'Hotel', amount: 100 });
  });

  it('PATCHes and DELETEs the budget path', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return req.method === 'DELETE' ? new Response(null, { status: 204 }) : json({ id: 7 });
      }),
    );
    await updateBudget(5, 7, { name: 'x' }, api);
    await deleteBudget(5, 7, api);
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      'PATCH /trips/5/budgets/7',
      'DELETE /trips/5/budgets/7',
    ]);
  });

  it('PATCHes the payment path with isPaid', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ id: 3, isPaid: true });
      }),
    );
    const res = await markBudgetPayment(5, 7, 3, true, api);
    expect(res.isPaid).toBe(true);
    expect(calls[0]?.method).toBe('PATCH');
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/budgets/7/payments/3');
    expect(await calls[0]!.json()).toEqual({ isPaid: true });
  });

  it('throws a classified error on failure', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'Forbidden' }, 403)),
    );
    await expect(
      createBudget(5, { name: 'a', amount: 1, scope: 'GROUP' }, api),
    ).rejects.toBeInstanceOf(ApiMutationError);
  });

  it('useMarkPayment invalidates budgets, breakdown and expenses for the trip', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ id: 3, isPaid: true })),
    );
    const qc = new QueryClient({
      defaultOptions: { mutations: { gcTime: 0 }, queries: { gcTime: 0 } },
    });
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);
    const { result } = await renderHook(() => useMarkPayment(5, api), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ budgetId: 7, paymentId: 3, isPaid: true });
    });

    const invalidated = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(invalidated).toEqual([
      keys.trips.expenses(5),
      keys.trips.breakdown(5),
      keys.trips.budgets(5),
    ]);
  });
});
