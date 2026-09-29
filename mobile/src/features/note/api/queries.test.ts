import { createApiClient } from '@/api/client';

import { fetchTripNotes } from './queries';

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('fetchTripNotes', () => {
  it('GETs the notes list path and returns the data array', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ data: [{ id: 1, tripId: 5, title: 'Packing' }] });
      }),
    );
    const notes = await fetchTripNotes(5, api);
    expect(notes).toEqual([{ id: 1, tripId: 5, title: 'Packing' }]);
    expect(calls[0]?.method).toBe('GET');
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/notes');
  });

  it('throws HttpError on a non-2xx response', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'Forbidden' }, 403)),
    );
    await expect(fetchTripNotes(5, api)).rejects.toMatchObject({ status: 403 });
  });
});
