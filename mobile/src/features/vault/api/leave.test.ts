import { createApiClient } from '@/api/client';
import { ApiMutationError } from '@/api/mutationError';

import {
  announceVaultLeave,
  clearVaultLeave,
  confirmVaultLeave,
  listVaultLeaveRequests,
} from './leave';

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('announceVaultLeave', () => {
  it('POSTs the announce path and returns the request', async () => {
    const calls: Request[] = [];
    const request = {
      tripId: 5,
      userId: 9,
      displayName: 'Ken',
      netMicro: '0',
      announcedNetMicro: '0',
      status: 'READY',
      requestedAt: '2026-09-28T10:00:00Z',
    };
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ request });
      }),
    );
    const res = await announceVaultLeave(5, api);
    expect(res.request).toEqual(request);
    expect(calls[0]?.method).toBe('POST');
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/vault-leave/announce');
  });

  it('throws ApiMutationError on a non-2xx response', async () => {
    const api = createApiClient('http://x', fakeFetch(() => json({ message: 'no' }, 403)));
    await expect(announceVaultLeave(5, api)).rejects.toBeInstanceOf(ApiMutationError);
  });
});

describe('clearVaultLeave', () => {
  it('POSTs the host-clear path for the given member', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ cleared: true });
      }),
    );
    const res = await clearVaultLeave(5, 9, api);
    expect(res.cleared).toBe(true);
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/members/9/vault-leave-clear');
  });
});

describe('listVaultLeaveRequests', () => {
  it('GETs the pending requests and returns the items array', async () => {
    const items = [
      {
        tripId: 5,
        userId: 9,
        displayName: 'Ken',
        netMicro: '-2000000',
        announcedNetMicro: '0',
        status: 'WAITING_DEPOSIT',
        requestedAt: '2026-09-28T10:00:00Z',
      },
    ];
    const api = createApiClient('http://x', fakeFetch(() => json({ items })));
    const res = await listVaultLeaveRequests(5, api);
    expect(res).toEqual(items);
  });
});

describe('confirmVaultLeave', () => {
  it('POSTs the confirm path and returns the result', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ completed: true, payoutPending: false });
      }),
    );
    const res = await confirmVaultLeave(5, 9, api);
    expect(res).toEqual({ completed: true, payoutPending: false });
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/vault-leave/requests/9/confirm');
  });
});
