import { createTestQueryClient } from '@/testSupport/queryClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import React from 'react';
import { Alert } from 'react-native';

import { createApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import { initI18n } from '@/i18n';

import type { DayContext } from './helpers/planDays';
import { planningDayCountStore, usePlanningDayCountStore } from './planningDayCountStore';
import type { PlanItemDto } from './types';
import { useDayOps } from './useDayOps';

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function makeWrapper(qc: QueryClient) {
  function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  }
  return Wrapper;
}

let nextId = 1;
function item(overrides: Partial<PlanItemDto> = {}): PlanItemDto {
  return {
    id: nextId++,
    tripId: 1,
    title: 'Item',
    imageUrls: [],
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    members: [],
    ...overrides,
  };
}

beforeAll(() => {
  initI18n();
});

beforeEach(() => {
  nextId = 1;
  // `deleteDay`'s "only 1 day left" guard reads this shared store directly in counter mode —
  // reset it so one test's bump/ensure doesn't leak into the next.
  usePlanningDayCountStore.setState({ counts: {} });
});

describe('useDayOps', () => {
  it('deleteDay DELETEs day-2 items and PATCHes dayNumber for day-3 items, then invalidates', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return req.method === 'DELETE' ? new Response(null, { status: 204 }) : json({ id: 1 });
      }),
    );
    const qc = createTestQueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    const planItems = [
      item({ id: 1, dayNumber: 1 }),
      item({ id: 2, dayNumber: 2 }),
      item({ id: 3, dayNumber: 2 }),
      item({ id: 4, dayNumber: 3 }),
    ];
    qc.setQueryData(keys.trips.planItems(1), planItems);
    planningDayCountStore.ensure(1, 3);
    const bumpLocalDayCount = jest.fn();

    const { result } = await renderHook(() => useDayOps(1, { bumpLocalDayCount }, api), {
      wrapper: makeWrapper(qc),
    });

    const ctx: DayContext = { isPlanningMode: true, startDate: null, endDate: null, planItems };

    await act(async () => {
      await result.current.deleteDay(ctx, 2);
    });

    const calledPaths = calls.map((c) => `${c.method} ${new URL(c.url).pathname}`).sort();
    expect(calledPaths).toEqual([
      'DELETE /trips/1/plan-items/2',
      'DELETE /trips/1/plan-items/3',
      'PATCH /trips/1/plan-items/4',
    ]);
    const patchCall = calls.find((c) => c.method === 'PATCH')!;
    expect(await patchCall.json()).toMatchObject({ dayNumber: 2 });
    // Counter mode (no scheduled dates): deleting a day shrinks the local counter too.
    expect(bumpLocalDayCount).toHaveBeenCalledWith(-1);
  });

  it('deleteDay on an empty trailing counter-mode day makes no requests but still bumps -1', async () => {
    // "+ add" (bump +1, no items placed yet) then immediately "Delete" on that day:
    // `deleteDayOps` legitimately returns `[]` (nothing to PATCH/DELETE on the server), but the
    // shared counter still needs to shrink back down, or the chip strip would never lose the row.
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ id: 1 });
      }),
    );
    const qc = createTestQueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    planningDayCountStore.ensure(1, 2);
    const bumpLocalDayCount = jest.fn();

    const { result } = await renderHook(() => useDayOps(1, { bumpLocalDayCount }, api), {
      wrapper: makeWrapper(qc),
    });

    const ctx: DayContext = { isPlanningMode: true, startDate: null, endDate: null, planItems: [] };

    await act(async () => {
      await result.current.deleteDay(ctx, 2);
    });

    expect(calls).toHaveLength(0);
    expect(bumpLocalDayCount).toHaveBeenCalledTimes(1);
    expect(bumpLocalDayCount).toHaveBeenCalledWith(-1);
  });

  it('deleteDay does nothing (no bump, no requests) when only 1 counter-mode day remains', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ id: 1 });
      }),
    );
    const qc = createTestQueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    // Default store count for an untouched tripId is 1.
    const bumpLocalDayCount = jest.fn();

    const { result } = await renderHook(() => useDayOps(1, { bumpLocalDayCount }, api), {
      wrapper: makeWrapper(qc),
    });

    const ctx: DayContext = { isPlanningMode: true, startDate: null, endDate: null, planItems: [] };

    await act(async () => {
      await result.current.deleteDay(ctx, 1);
    });

    expect(calls).toHaveLength(0);
    expect(bumpLocalDayCount).not.toHaveBeenCalled();
  });

  it('rearrange([2, 1, 3]) PATCHes only the items on days 1 and 2', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ id: 1 });
      }),
    );
    const qc = createTestQueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    const planItems = [
      item({ id: 1, dayNumber: 1 }),
      item({ id: 2, dayNumber: 2 }),
      item({ id: 3, dayNumber: 3 }),
    ];
    qc.setQueryData(keys.trips.planItems(1), planItems);
    const bumpLocalDayCount = jest.fn();

    const { result } = await renderHook(() => useDayOps(1, { bumpLocalDayCount }, api), {
      wrapper: makeWrapper(qc),
    });

    const ctx: DayContext = { isPlanningMode: true, startDate: null, endDate: null, planItems };

    await act(async () => {
      await result.current.rearrange(ctx, [2, 1, 3]);
    });

    expect(calls).toHaveLength(2);
    const byId: Record<number, Request> = {};
    for (const req of calls) {
      const id = Number(new URL(req.url).pathname.split('/').pop());
      byId[id] = req;
    }
    expect(await byId[1]!.json()).toMatchObject({ dayNumber: 2 });
    expect(await byId[2]!.json()).toMatchObject({ dayNumber: 1 });
    expect(bumpLocalDayCount).not.toHaveBeenCalled();
  });

  it('addDay in date mode PATCHes the trip endDate +1 day', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ id: 1, startDate: '2026-01-01', endDate: '2026-01-03' });
      }),
    );
    const qc = createTestQueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    const bumpLocalDayCount = jest.fn();

    const { result } = await renderHook(() => useDayOps(1, { bumpLocalDayCount }, api), {
      wrapper: makeWrapper(qc),
    });

    const ctx: DayContext = {
      isPlanningMode: true,
      startDate: '2026-01-01',
      endDate: '2026-01-02',
      planItems: [],
    };

    await act(async () => {
      await result.current.addDay(ctx);
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('PATCH');
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/1');
    expect(await calls[0]!.json()).toMatchObject({
      startDate: '2026-01-01',
      endDate: '2026-01-03',
    });
    expect(bumpLocalDayCount).not.toHaveBeenCalled();
  });

  it('addDay in counter mode (no dates) just bumps the local counter, no requests', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ id: 1 });
      }),
    );
    const qc = createTestQueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    const bumpLocalDayCount = jest.fn();

    const { result } = await renderHook(() => useDayOps(1, { bumpLocalDayCount }, api), {
      wrapper: makeWrapper(qc),
    });

    const ctx: DayContext = { isPlanningMode: true, startDate: null, endDate: null, planItems: [] };

    await act(async () => {
      await result.current.addDay(ctx);
    });

    expect(calls).toHaveLength(0);
    expect(bumpLocalDayCount).toHaveBeenCalledWith(1);
  });

  it('addDay does nothing once 14 days are already available', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ id: 1 });
      }),
    );
    const qc = createTestQueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    const bumpLocalDayCount = jest.fn();

    const { result } = await renderHook(() => useDayOps(1, { bumpLocalDayCount }, api), {
      wrapper: makeWrapper(qc),
    });

    const planItems = [item({ id: 1, dayNumber: 14 })];
    const ctx: DayContext = { isPlanningMode: true, startDate: null, endDate: null, planItems };

    await act(async () => {
      await result.current.addDay(ctx);
    });

    expect(calls).toHaveLength(0);
    expect(bumpLocalDayCount).not.toHaveBeenCalled();
  });

  it('addDay does nothing once the shared counter-mode counter is already at 14 (no items yet)', async () => {
    // Symmetric to the `deleteDay` under-counting fix: `canAddDay(ctx)` alone only sees
    // `ctx.planItems`-derived days, so a run of empty "+ add"s would otherwise never hit the cap.
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ id: 1 });
      }),
    );
    const qc = createTestQueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    planningDayCountStore.ensure(1, 14);
    const bumpLocalDayCount = jest.fn();

    const { result } = await renderHook(() => useDayOps(1, { bumpLocalDayCount }, api), {
      wrapper: makeWrapper(qc),
    });

    const ctx: DayContext = { isPlanningMode: true, startDate: null, endDate: null, planItems: [] };

    await act(async () => {
      await result.current.addDay(ctx);
    });

    expect(calls).toHaveLength(0);
    expect(bumpLocalDayCount).not.toHaveBeenCalled();
  });

  it('alerts "Something went wrong" after the refetch when an op rejects', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        if (req.method === 'DELETE') return new Response(null, { status: 403 });
        return json({ id: 1 });
      }),
    );
    const qc = createTestQueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    const planItems = [item({ id: 1, dayNumber: 1 }), item({ id: 2, dayNumber: 2 })];
    qc.setQueryData(keys.trips.planItems(1), planItems);
    planningDayCountStore.ensure(1, 2);
    const bumpLocalDayCount = jest.fn();

    const { result } = await renderHook(() => useDayOps(1, { bumpLocalDayCount }, api), {
      wrapper: makeWrapper(qc),
    });

    const ctx: DayContext = { isPlanningMode: true, startDate: null, endDate: null, planItems };

    await act(async () => {
      await result.current.deleteDay(ctx, 1);
    });

    expect(alertSpy).toHaveBeenCalledWith('Something went wrong');
    alertSpy.mockRestore();
  });
});
