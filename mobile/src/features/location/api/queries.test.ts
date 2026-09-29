/** @jest-environment node */
import { createApiClient } from '@/api/client';

import { fetchLocationSearch, SUGGESTED_CITIES } from './queries';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'anon-uuid' }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { variant: 'dev', apiUrl: 'https://api.test', linkHosts: [] } } },
}));

const BASE = 'https://api.test';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const hanoiResult = {
  city: { id: 1, name: 'Hanoi', latitude: '21.03', longitude: '105.85' },
  state: { id: 10, name: 'Hanoi', iso2: 'HN', type: 'city', latitude: null, longitude: null },
  country: {
    id: 100,
    name: 'Vietnam',
    iso2: 'VN',
    iso3: 'VNM',
    phoneCode: '84',
    capital: 'Hanoi',
    currency: 'VND',
    region: 'Asia',
    subRegion: 'South-Eastern Asia',
    emoji: '🇻🇳',
  },
};

let requests: string[] = [];

const fakeFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const url = new URL(request.url);
  requests.push(`${request.method} ${url.pathname}${url.search}`);
  return json([hanoiResult]);
};

const api = createApiClient(BASE, fakeFetch);

beforeEach(() => {
  requests = [];
});

describe('SUGGESTED_CITIES', () => {
  it('has 10 curated city names', () => {
    expect(SUGGESTED_CITIES).toHaveLength(10);
    expect(SUGGESTED_CITIES).toContain('Tokyo');
    expect(SUGGESTED_CITIES).toContain('Da Nang');
  });
});

describe('fetchLocationSearch', () => {
  it('calls GET /locations/search with the search text and take', async () => {
    const result = await fetchLocationSearch('han', 50, api);
    expect(result).toEqual([hanoiResult]);
    expect(requests).toEqual(['GET /locations/search?search=han&take=50']);
  });
});
