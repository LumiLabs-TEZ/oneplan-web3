import { createApiClient } from '@/api/client';
import { ApiMutationError } from '@/api/mutationError';

import { declineInvite } from './declineInvite';

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const preview = (isMember = false) => ({
  tripId: 7,
  name: 'Tokyo',
  coverImageUrl: null,
  memberCount: 1,
  status: 'PLANNING',
  isMember,
});

function client(respondStatus: number, isMember = false) {
  const calls: Request[] = [];
  const api = createApiClient(
    'http://x',
    fakeFetch((req) => {
      calls.push(req);
      if (req.method === 'GET') return json(preview(isMember));
      return json(respondStatus < 300 ? { id: 1 } : { message: 'x' }, respondStatus);
    }),
  );
  return { api, calls };
}

describe('declineInvite', () => {
  it('PATCHes DECLINED for the trip behind the invite code', async () => {
    const { api, calls } = client(200);

    await declineInvite('ABC123', api);

    expect(new URL(calls[0]!.url).pathname).toBe('/trips/join/ABC123/preview');
    const patch = calls[1]!;
    expect(patch.method).toBe('PATCH');
    expect(new URL(patch.url).pathname).toBe('/trips/7/members/respond');
    expect(await patch.json()).toEqual({ status: 'DECLINED' });
  });

  it('skips the PATCH when the user is already a member', async () => {
    const { api, calls } = client(200, true);

    await declineInvite('ABC123', api);

    expect(calls).toHaveLength(1);
  });

  it.each([404, 400])('treats %i as already gone', async (status) => {
    const { api } = client(status);

    await expect(declineInvite('ABC123', api)).resolves.toBeUndefined();
  });

  it('throws an ApiMutationError on other failures', async () => {
    const { api } = client(500);

    await expect(declineInvite('ABC123', api)).rejects.toBeInstanceOf(ApiMutationError);
  });
});
