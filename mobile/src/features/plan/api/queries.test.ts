import { createApiClient } from '@/api/client';

import { fetchDownloadUrl, fetchLocationPlanCount, fetchPlanItem, fetchPlanRoute } from './queries';

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('plan queries', () => {
  it('GETs the plan item detail path', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ id: 9, tripId: 5 });
      }),
    );
    const res = await fetchPlanItem(5, 9, api);
    expect(res.id).toBe(9);
    expect(calls[0]?.method).toBe('GET');
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/plan-items/9');
  });

  it('GETs the plan route with the date as a query param', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ pins: [], legs: [] });
      }),
    );
    await fetchPlanRoute(5, { date: '2026-09-16' }, api);
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/plan-route');
    expect(new URL(calls[0]!.url).searchParams.get('date')).toBe('2026-09-16');
    expect(new URL(calls[0]!.url).searchParams.has('day')).toBe(false);
  });

  it('GETs the plan route by day number for planning-mode trips', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ pins: [], legs: [] });
      }),
    );
    await fetchPlanRoute(5, { day: 2 }, api);
    expect(new URL(calls[0]!.url).searchParams.get('day')).toBe('2');
    expect(new URL(calls[0]!.url).searchParams.has('date')).toBe(false);
  });

  it('GETs the location plan count and returns the count field', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ location: 'Tokyo', count: 7 });
      }),
    );
    const count = await fetchLocationPlanCount('Tokyo', api);
    expect(count).toBe(7);
    expect(new URL(calls[0]!.url).pathname).toBe('/plan-items/stats/location-plan-count');
    expect(new URL(calls[0]!.url).searchParams.get('location')).toBe('Tokyo');
  });

  it('GETs the download url and returns the url field', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ url: 'https://signed', expiresIn: 3000 });
      }),
    );
    const url = await fetchDownloadUrl('trips/1/x.jpg', api);
    expect(url).toBe('https://signed');
    expect(new URL(calls[0]!.url).pathname).toBe('/uploads/url');
    expect(new URL(calls[0]!.url).searchParams.get('objectKey')).toBe('trips/1/x.jpg');
  });

  it('throws HttpError on a non-2xx response', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'Not found' }, 404)),
    );
    await expect(fetchPlanItem(5, 9, api)).rejects.toMatchObject({ status: 404 });
  });
});
