import { createFoursquareProvider } from './foursquare';

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('createFoursquareProvider', () => {
  it('has the foursquare name and "Powered by Foursquare" attribution', () => {
    const provider = createFoursquareProvider({ apiKey: 'k' });
    expect(provider.name).toBe('foursquare');
    expect(provider.attribution).toBe('Powered by Foursquare');
  });

  it('search() requests the expected URL and headers, with bias as ll', async () => {
    const calls: Request[] = [];
    const provider = createFoursquareProvider({
      apiKey: 'test-key',
      fetchFn: fakeFetch((req) => {
        calls.push(req);
        return json({ results: [] });
      }),
    });

    await provider.search('pho', { latitude: 10.7, longitude: 106.7 });

    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    expect(url.origin + url.pathname).toBe('https://places-api.foursquare.com/places/search');
    expect(url.searchParams.get('query')).toBe('pho');
    expect(url.searchParams.get('fields')).toBe(
      'fsq_place_id,name,latitude,longitude,location,categories',
    );
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('ll')).toBe('10.7,106.7');
    expect(calls[0]!.headers.get('Authorization')).toBe('Bearer test-key');
    expect(calls[0]!.headers.get('X-Places-Api-Version')).toBe('2025-06-17');
    expect(calls[0]!.headers.get('Accept')).toBe('application/json');
  });

  it('search() omits ll when no bias is given', async () => {
    const calls: Request[] = [];
    const provider = createFoursquareProvider({
      apiKey: 'test-key',
      fetchFn: fakeFetch((req) => {
        calls.push(req);
        return json({ results: [] });
      }),
    });

    await provider.search('pho');

    const url = new URL(calls[0]!.url);
    expect(url.searchParams.has('ll')).toBe(false);
  });

  it('maps a result using formatted_address and the first category', async () => {
    const provider = createFoursquareProvider({
      apiKey: 'k',
      fetchFn: fakeFetch(() =>
        json({
          results: [
            {
              fsq_place_id: '4b0587',
              name: 'Banh Mi Huynh Hoa',
              latitude: 10.771886,
              longitude: 106.692526,
              location: { formatted_address: '26 Le Thi Rieng, District 1, HCMC' },
              categories: [{ name: 'Vietnamese Restaurant' }],
            },
          ],
        }),
      ),
    });

    const results = await provider.search('banh mi');
    expect(results).toEqual([
      {
        placeId: 'fsq:4b0587',
        name: 'Banh Mi Huynh Hoa',
        address: '26 Le Thi Rieng, District 1, HCMC',
        latitude: 10.771886,
        longitude: 106.692526,
        category: 'Vietnamese Restaurant',
      },
    ]);
  });

  it('falls back to joining address + locality when formatted_address is absent', async () => {
    const provider = createFoursquareProvider({
      apiKey: 'k',
      fetchFn: fakeFetch(() =>
        json({
          results: [
            {
              fsq_place_id: 'x',
              name: 'Some Cafe',
              latitude: 1,
              longitude: 2,
              location: { address: '26 Le Thi Rieng', locality: 'District 1' },
            },
          ],
        }),
      ),
    });

    const results = await provider.search('cafe');
    expect(results[0]?.address).toBe('26 Le Thi Rieng, District 1');
  });

  it('drops results with a blank name', async () => {
    const provider = createFoursquareProvider({
      apiKey: 'k',
      fetchFn: fakeFetch(() =>
        json({ results: [{ fsq_place_id: 'x', name: '  ', latitude: 1, longitude: 2 }] }),
      ),
    });

    expect(await provider.search('x')).toEqual([]);
  });

  it('drops results with non-finite coordinates', async () => {
    const provider = createFoursquareProvider({
      apiKey: 'k',
      fetchFn: fakeFetch(() =>
        json({ results: [{ fsq_place_id: 'x', name: 'No Coords' }] }),
      ),
    });

    expect(await provider.search('x')).toEqual([]);
  });

  it('returns [] and logs once when no API key is configured', async () => {
    const log = jest.fn();
    const fetchFn = jest.fn();
    const provider = createFoursquareProvider({ apiKey: null, fetchFn: fetchFn as never, log });

    expect(await provider.search('pho')).toEqual([]);
    expect(await provider.search('pho again')).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('returns [] on a non-2xx response', async () => {
    const provider = createFoursquareProvider({
      apiKey: 'k',
      fetchFn: fakeFetch(() => json({ message: 'unauthorized' }, 401)),
    });

    expect(await provider.search('pho')).toEqual([]);
  });

  it('returns [] on a network failure', async () => {
    const provider = createFoursquareProvider({
      apiKey: 'k',
      fetchFn: (() => Promise.reject(new Error('offline'))) as typeof fetch,
    });

    expect(await provider.search('pho')).toEqual([]);
  });

  it('returns [] when the request is aborted', async () => {
    const controller = new AbortController();
    const provider = createFoursquareProvider({
      apiKey: 'k',
      fetchFn: (() => {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        return Promise.reject(err);
      }) as typeof fetch,
    });
    controller.abort();

    expect(await provider.search('pho', null, controller.signal)).toEqual([]);
  });

  it('searchNearby() requests fsq_category_ids, ll, limit and DISTANCE sort', async () => {
    const calls: Request[] = [];
    const provider = createFoursquareProvider({
      apiKey: 'k',
      fetchFn: fakeFetch((req) => {
        calls.push(req);
        return json({ results: [] });
      }),
    });

    await provider.searchNearby(['4d4b7105d754a06374d81259', '13035'], { latitude: 10.7, longitude: 106.7 }, 5);

    const url = new URL(calls[0]!.url);
    expect(url.searchParams.get('fsq_category_ids')).toBe('4d4b7105d754a06374d81259,13035');
    expect(url.searchParams.get('ll')).toBe('10.7,106.7');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('sort')).toBe('DISTANCE');
  });

  it('searchNearby() sorts by distance from the bias point and caps to limit', async () => {
    const bias = { latitude: 10.7, longitude: 106.7 };
    const provider = createFoursquareProvider({
      apiKey: 'k',
      fetchFn: fakeFetch(() =>
        json({
          results: [
            { fsq_place_id: 'far', name: 'Far', latitude: 10.9, longitude: 106.9 },
            { fsq_place_id: 'near', name: 'Near', latitude: 10.701, longitude: 106.701 },
            { fsq_place_id: 'mid', name: 'Mid', latitude: 10.75, longitude: 106.75 },
          ],
        }),
      ),
    });

    const results = await provider.searchNearby(['13035'], bias, 2);
    expect(results.map((r) => r.placeId)).toEqual(['fsq:near', 'fsq:mid']);
    expect(results).toHaveLength(2);
  });
});
