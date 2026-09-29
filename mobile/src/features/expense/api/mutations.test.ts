import { QueryClient } from '@tanstack/react-query';

import { createApiClient } from '@/api/client';
import { keys } from '@/api/keys';

import {
  createExpense,
  deleteExpense,
  ExpenseMutationError,
  invalidateTripMoney,
  updateExpense,
} from './mutations';

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('expense mutations', () => {
  it('POSTs the create body and returns the expense', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ id: 9, name: 'Lunch' }, 201);
      }),
    );
    const res = await createExpense(
      5,
      { name: 'Lunch', amount: 10, category: 'FOOD', memberIds: [1], expenseDate: 'now' },
      api,
    );
    expect(res.id).toBe(9);
    expect(calls[0]?.method).toBe('POST');
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/expenses');
    expect(await calls[0]!.json()).toMatchObject({ name: 'Lunch', memberIds: [1] });
  });

  it('PATCHes and DELETEs the expense path', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return req.method === 'DELETE' ? new Response(null, { status: 204 }) : json({ id: 7 });
      }),
    );
    await updateExpense(5, 7, { name: 'x' }, api);
    await deleteExpense(5, 7, api);
    expect(calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      'PATCH /trips/5/expenses/7',
      'DELETE /trips/5/expenses/7',
    ]);
  });

  it('throws a classified error on failure', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'Forbidden' }, 403)),
    );
    await expect(
      createExpense(
        5,
        { name: 'a', amount: 1, category: 'FOOD', memberIds: [1], expenseDate: 'd' },
        api,
      ),
    ).rejects.toBeInstanceOf(ExpenseMutationError);
  });

  it('invalidates expenses, breakdown and budgets for the trip', async () => {
    const qc = new QueryClient();
    const spy = jest.spyOn(qc, 'invalidateQueries');
    await invalidateTripMoney(qc, 5);
    const invalidated = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(invalidated).toEqual([
      keys.trips.expenses(5),
      keys.trips.breakdown(5),
      keys.trips.budgets(5),
    ]);
  });
});
