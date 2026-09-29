import { createApiClient } from '@/api/client';
import { ApiMutationError } from '@/api/mutationError';

import { submitRating } from './ratings';

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('submitRating', () => {
  it('POSTs the rating to the listing path', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ userRating: 4, averageRating: '4.5', ratingCount: 2 }, 201);
      }),
    );
    const res = await submitRating(88, 4, api);
    expect(res.userRating).toBe(4);
    expect(calls[0]?.method).toBe('POST');
    expect(new URL(calls[0]!.url).pathname).toBe('/marketplace/listings/88/ratings');
    expect(await calls[0]!.json()).toEqual({ rating: 4 });
  });

  it('throws ApiMutationError when the user has not acquired the plan', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'Forbidden' }, 403)),
    );
    await expect(submitRating(88, 4, api)).rejects.toBeInstanceOf(ApiMutationError);
  });
});
