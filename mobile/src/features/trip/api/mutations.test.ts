import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import React from 'react';

import { createApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';

import {
  createTrip,
  deleteTrip,
  invalidateTrip,
  invalidateTripLists,
  useUpdateTrip,
  joinTrip,
  removeMember,
  updateTrip,
  useCreateTrip,
} from './mutations';

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('trip mutations', () => {
  it('POSTs the create body and returns the trip', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ id: 3, name: 'Da Lat' }, 201);
      }),
    );
    const res = await createTrip({ name: 'Da Lat' }, api);
    expect(res.id).toBe(3);
    expect(calls[0]?.method).toBe('POST');
    expect(new URL(calls[0]!.url).pathname).toBe('/trips');
    expect(await calls[0]!.json()).toMatchObject({ name: 'Da Lat' });
  });

  it('PATCHes and DELETEs the trip path', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return req.method === 'DELETE' ? new Response(null, { status: 204 }) : json({ id: 5 });
      }),
    );
    await updateTrip(5, { name: 'x' }, api);
    await deleteTrip(5, api);
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      'PATCH /trips/5',
      'DELETE /trips/5',
    ]);
  });

  it('DELETEs the member path and returns the settlement', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ displayName: 'Ken', totalBudgetRefund: 10 });
      }),
    );
    const res = await removeMember(5, 9, api);
    expect(res.displayName).toBe('Ken');
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/members/9');
  });

  it('POSTs the invite code path for join', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ id: 5, name: 'Da Lat' });
      }),
    );
    const res = await joinTrip('ABC123', api);
    expect(res.id).toBe(5);
    expect(calls[0]?.method).toBe('POST');
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/join/ABC123');
  });

  it('updateTrip surfaces memberNames from a 400 conflict body', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() =>
        json({ statusCode: 400, error: 'MEMBER_CONFLICT', memberNames: ['Ken', 'Mai'] }, 400),
      ),
    );
    let caught: unknown;
    try {
      await updateTrip(5, { status: 'ONGOING' }, api);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiMutationError);
    const err = caught as ApiMutationError;
    expect(err.status).toBe(400);
    expect((err.body as { memberNames: string[] }).memberNames).toEqual(['Ken', 'Mai']);
  });

  it('throws a classified error on failure', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'Forbidden' }, 403)),
    );
    await expect(createTrip({ name: 'a' }, api)).rejects.toBeInstanceOf(ApiMutationError);
  });

  it('invalidateTripLists invalidates the trips list prefix', async () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    await invalidateTripLists(qc);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['trips', 'list'] });
  });

  it('invalidateTrip invalidates the detail prefix and lists', async () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    await invalidateTrip(qc, 5);
    const invalidated = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(invalidated).toEqual([keys.trips.detail(5), ['trips', 'list']]);
  });

  it('useCreateTrip invalidates the trips list on success', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ id: 3, name: 'Da Lat' }, 201)),
    );
    // gcTime: 0 avoids a real 5-minute GC timer that would keep Jest's process alive after the test.
    const qc = new QueryClient({
      defaultOptions: { mutations: { gcTime: 0 }, queries: { gcTime: 0 } },
    });
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);
    const { result } = await renderHook(() => useCreateTrip(api), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: 'Da Lat' });
    });

    expect(spy).toHaveBeenCalledWith({ queryKey: ['trips', 'list'] });
  });

  it.each([
    ['a rename sets the detail and refreshes only the lists', { name: 'Hue' }, [['trips', 'list']]],
    [
      'a currency change also refetches the converted slices',
      { currency: 'USD' },
      [keys.trips.detail(3), ['trips', 'list']],
    ],
  ])('useUpdateTrip: %s', async (_label, body, expected) => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ id: 3, name: 'Hue' })),
    );
    // Infinity (no timer at all) so the unobserved detail set by `onSuccess` survives to the assert.
    const qc = new QueryClient({
      defaultOptions: { mutations: { gcTime: 0 }, queries: { gcTime: Infinity } },
    });
    const spy = jest.spyOn(qc, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);
    const { result } = await renderHook(() => useUpdateTrip(3, api), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(body as never);
    });

    expect(qc.getQueryData(keys.trips.detail(3))).toEqual({ id: 3, name: 'Hue' });
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual(expected);
    qc.clear();
  });
});
