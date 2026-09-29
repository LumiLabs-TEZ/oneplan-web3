import { createApiClient } from '@/api/client';
import { ApiMutationError } from '@/api/mutationError';
import { acquireListing, requestPlan } from './mutations';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function client(handler: (request: Request) => Response) {
  return createApiClient('http://x', ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch);
}
it('recovers a duplicate acquisition from authoritative status', async () => {
  const api = client((req) =>
    req.method === 'POST' ? json({}, 409) : json({ applied: true, acquisitionId: 42 }),
  );
  expect(await acquireListing(3, 'pro', api)).toBe(42);
});
it('does not treat an unrelated conflict as ownership', async () => {
  const api = client((req) => (req.method === 'POST' ? json({}, 409) : json({ applied: false })));
  await expect(acquireListing(3, 'spark', api)).rejects.toBeInstanceOf(ApiMutationError);
});
it('propagates insufficient Spark errors without calling acquire', async () => {
  const paths: string[] = [];
  const api = client((req) => {
    paths.push(new URL(req.url).pathname);
    return json({ code: 'insufficient_spark', message: 'Insufficient Sparks' }, 400);
  });
  await expect(acquireListing(3, 'spark', api)).rejects.toMatchObject({ status: 400 });
  expect(paths).toEqual(['/missions/redeem']);
});

it('preserves request conflicts for duplicate-request feedback', async () => {
  const api = client(() =>
    json({ message: 'You already have an open request for this destination.' }, 409),
  );
  await expect(
    requestPlan({ countryId: 1, currency: 'VND', tag: 'FRIENDS' }, api),
  ).rejects.toMatchObject({ status: 409 });
});
