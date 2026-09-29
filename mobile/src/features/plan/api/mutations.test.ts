import { QueryClient } from '@tanstack/react-query';

import { createApiClient } from '@/api/client';
import { ApiMutationError } from '@/api/mutationError';
import { keys } from '@/api/keys';

import { createPlanItem, invalidatePlanItems, updatePlanItem } from './mutations';

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('plan-item mutations', () => {
  it('POSTs the create body and returns the plan item (201)', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ id: 9, title: 'Museum' }, 201);
      }),
    );
    const res = await createPlanItem(5, { title: 'Museum', userIds: [1] }, api);
    expect(res.id).toBe(9);
    expect(calls[0]?.method).toBe('POST');
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/plan-items');
    expect(await calls[0]!.json()).toMatchObject({ title: 'Museum', userIds: [1] });
  });

  it('PATCHes the plan item path and returns the body (200)', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ id: 7, title: 'Updated' });
      }),
    );
    const res = await updatePlanItem(5, 7, { title: 'Updated' }, api);
    expect(res.title).toBe('Updated');
    expect(calls[0]?.method).toBe('PATCH');
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/plan-items/7');
  });

  it('throws ApiMutationError on a 400', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'Bad request' }, 400)),
    );
    await expect(createPlanItem(5, { title: 'x', userIds: [] }, api)).rejects.toBeInstanceOf(
      ApiMutationError,
    );
  });

  it('invalidates plan items and plan routes for the trip, and nothing else', async () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    await invalidatePlanItems(qc, 5);
    const invalidated = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(invalidated).toEqual([keys.trips.planItems(5), keys.trips.planRoutes(5)]);
  });
});
