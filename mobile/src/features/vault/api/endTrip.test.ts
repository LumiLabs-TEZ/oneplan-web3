import { createApiClient } from '@/api/client';
import { ApiMutationError } from '@/api/mutationError';
import { HttpError } from '@/features/trip/api/queries';

import {
  castTripEndVote,
  confirmVaultCashDebt,
  fetchTripEndRequest,
  fetchTripEndReview,
  requestTripEndIdempotent,
} from './endTrip';
import type { TripEndRequestDto } from './endTrip';

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
  });

const REQUEST: TripEndRequestDto = {
  id: 1,
  tripId: 5,
  requestedBy: 1,
  status: 'PENDING',
  createdAt: '2026-01-01T00:00:00.000Z',
  resolvedAt: null,
  myDecision: null,
  approvedCount: 0,
  memberCount: 2,
  members: [],
};

describe('fetchTripEndRequest', () => {
  it('GETs the end-request path and returns the body', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json(REQUEST);
      }),
    );
    const res = await fetchTripEndRequest(5, api);
    expect(res).toEqual(REQUEST);
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/end-request');
  });

  it('resolves to null on 404 (no end request) instead of throwing', async () => {
    const api = createApiClient('http://x', fakeFetch(() => json(undefined, 404)));
    await expect(fetchTripEndRequest(5, api)).resolves.toBeNull();
  });

  it('throws HttpError on any other non-2xx status', async () => {
    const api = createApiClient('http://x', fakeFetch(() => json(undefined, 500)));
    await expect(fetchTripEndRequest(5, api)).rejects.toBeInstanceOf(HttpError);
  });
});

describe('fetchTripEndReview', () => {
  it('GETs the review path', async () => {
    const calls: Request[] = [];
    const review = { request: REQUEST, history: [], mySettlement: [], balanceMicro: '0' };
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json(review);
      }),
    );
    const res = await fetchTripEndReview(5, api);
    expect(res).toEqual(review);
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/end-request/review');
  });
});

describe('requestTripEndIdempotent', () => {
  it('POSTs and returns the new request on success', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json(REQUEST, 201);
      }),
    );
    const res = await requestTripEndIdempotent(5, api);
    expect(res).toEqual(REQUEST);
    expect(calls[0]?.method).toBe('POST');
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/end-request');
  });

  it('on 409 (already pending), fetches and returns the existing request instead of throwing', async () => {
    let posted = false;
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        if (req.method === 'POST') {
          posted = true;
          return json(undefined, 409);
        }
        return json(REQUEST);
      }),
    );
    const res = await requestTripEndIdempotent(5, api);
    expect(posted).toBe(true);
    expect(res).toEqual(REQUEST);
  });

  it('rejects with ApiMutationError on 403 (not the creator)', async () => {
    const api = createApiClient('http://x', fakeFetch(() => json(undefined, 403)));
    await expect(requestTripEndIdempotent(5, api)).rejects.toBeInstanceOf(ApiMutationError);
  });
});

describe('castTripEndVote', () => {
  it('POSTs the decision body and returns the updated request', async () => {
    const calls: Request[] = [];
    const approved = { ...REQUEST, myDecision: 'APPROVED' as const, approvedCount: 1 };
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json(approved);
      }),
    );
    const res = await castTripEndVote(5, 'APPROVED', api);
    expect(res).toEqual(approved);
    expect(await calls[0]!.json()).toEqual({ decision: 'APPROVED' });
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/end-request/vote');
  });
});

describe('confirmVaultCashDebt', () => {
  it('POSTs the debtor id — the creditor-only permission is enforced server-side, not the payload', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json(undefined, 201);
      }),
    );
    await confirmVaultCashDebt(5, 2, api);
    expect(await calls[0]!.json()).toEqual({ fromUserId: 2 });
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/vault/settlement/cash/confirm');
  });

  it('throws ApiMutationError when the server rejects a non-creditor confirm', async () => {
    const api = createApiClient('http://x', fakeFetch(() => json(undefined, 403)));
    await expect(confirmVaultCashDebt(5, 2, api)).rejects.toBeInstanceOf(ApiMutationError);
  });
});
