/** @jest-environment node */
import { createApiClient } from '@/api/client';

import { fetchAllPhotos, fetchPhotosPage } from './photos';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'anon-uuid' }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { variant: 'dev', apiUrl: 'https://api.test', linkHosts: [] } } },
}));

const BASE = 'https://api.test';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function photo(id: number) {
  return {
    id,
    tripId: 1,
    url: `https://cdn.test/${id}.jpg`,
    uploadedById: 1,
    uploaderDisplayName: 'Ken',
    createdAt: '2026-03-10T08:00:00.000Z',
  };
}

let requests: string[] = [];

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

beforeEach(() => {
  requests = [];
});

describe('fetchPhotosPage', () => {
  it('requests page 1 with take=20 and no cursor', async () => {
    const api = createApiClient(
      BASE,
      fakeFetch((req) => {
        requests.push(`${req.method} ${new URL(req.url).pathname}${new URL(req.url).search}`);
        return json({ data: [photo(1)], nextCursor: null });
      }),
    );
    const result = await fetchPhotosPage(1, null, 20, api);
    expect(result).toEqual({ data: [photo(1)], nextCursor: null });
    expect(requests).toEqual(['GET /trips/1/photos?take=20']);
  });

  it('requests page 2 with cursor=41 and take=20', async () => {
    const api = createApiClient(
      BASE,
      fakeFetch((req) => {
        requests.push(`${req.method} ${new URL(req.url).pathname}${new URL(req.url).search}`);
        return json({ data: [photo(42)], nextCursor: 42 });
      }),
    );
    await fetchPhotosPage(1, 41, 20, api);
    expect(requests).toEqual(['GET /trips/1/photos?cursor=41&take=20']);
  });
});

describe('fetchAllPhotos', () => {
  it('drains every page with take=50 and stops when nextCursor is null', async () => {
    let call = 0;
    const api = createApiClient(
      BASE,
      fakeFetch((req) => {
        call += 1;
        requests.push(`${req.method} ${new URL(req.url).pathname}${new URL(req.url).search}`);
        if (call === 1) return json({ data: [photo(1), photo(2)], nextCursor: 2 });
        return json({ data: [photo(3)], nextCursor: null });
      }),
    );
    const all = await fetchAllPhotos(1, api);
    expect(all.map((p) => p.id)).toEqual([1, 2, 3]);
    expect(requests).toEqual([
      'GET /trips/1/photos?take=50',
      'GET /trips/1/photos?cursor=2&take=50',
    ]);
  });
});
