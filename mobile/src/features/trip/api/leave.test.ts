import { createApiClient } from '@/api/client';

import { fetchLeavePreview } from './leave';
import { HttpError } from './queries';

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('fetchLeavePreview', () => {
  it('GETs the leave-preview path and returns the body', async () => {
    const calls: Request[] = [];
    const preview = {
      displayName: 'Ken',
      budgets: [{ budgetName: 'Trip Fund', amount: 500_000, isPaid: true, refundAmount: 500_000 }],
      totalBudgetRefund: 500_000,
      totalBudgetCancelled: 0,
      totalExpenseShare: 150_000,
      netSettlement: 350_000,
    };
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json(preview);
      }),
    );
    const res = await fetchLeavePreview(5, api);
    expect(res).toEqual(preview);
    expect(calls[0]?.method).toBe('GET');
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/leave-preview');
  });

  it('throws HttpError on a non-2xx response', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'Not a member' }, 403)),
    );
    await expect(fetchLeavePreview(5, api)).rejects.toBeInstanceOf(HttpError);
  });
});
