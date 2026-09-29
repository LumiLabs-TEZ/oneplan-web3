import { createApiClient } from '@/api/client';
import { ApiMutationError } from '@/api/mutationError';

import { inviteMembers } from './inviteMembers';

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('inviteMembers', () => {
  it('POSTs the user ids and returns the new members', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json(
          [{ id: 1, userId: 9, displayName: 'X', inviteStatus: 'PENDING', isPro: false }],
          201,
        );
      }),
    );

    const res = await inviteMembers(5, [9], api);

    expect(res).toHaveLength(1);
    expect(res[0]?.userId).toBe(9);
    expect(calls[0]?.method).toBe('POST');
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/invite');
    expect(await calls[0]!.json()).toEqual({ userIds: [9] });
  });

  it('throws an ApiMutationError on failure', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'nope' }, 403)),
    );

    await expect(inviteMembers(5, [9], api)).rejects.toBeInstanceOf(ApiMutationError);
  });
});
