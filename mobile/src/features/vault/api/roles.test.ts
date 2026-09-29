import { createApiClient } from '@/api/client';
import { ApiMutationError } from '@/api/mutationError';

import { setMemberRole } from './roles';

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('setMemberRole', () => {
  it('PATCHes the role path with the requested role and returns the member', async () => {
    const calls: Request[] = [];
    const member = {
      id: 3,
      userId: 9,
      displayName: 'Ken',
      inviteStatus: 'ACCEPTED',
      role: 'CO_HOST',
      isPro: false,
    };
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json(member);
      }),
    );
    const res = await setMemberRole(5, 9, 'CO_HOST', api);
    expect(res).toEqual(member);
    expect(calls[0]?.method).toBe('PATCH');
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/members/9/role');
    expect(await calls[0]!.json()).toEqual({ role: 'CO_HOST' });
  });

  it('throws ApiMutationError when the caller is not the creator (403)', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'Only the creator can change roles' }, 403)),
    );
    await expect(setMemberRole(5, 9, 'MEMBER', api)).rejects.toBeInstanceOf(ApiMutationError);
  });
});
