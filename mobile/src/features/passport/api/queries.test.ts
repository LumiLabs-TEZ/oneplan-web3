/** @jest-environment node */
import { createApiClient } from '@/api/client';

import { fetchPassportSummary } from './queries';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'anon-uuid' }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { variant: 'dev', apiUrl: 'https://api.test', linkHosts: [] } } },
}));

const BASE = 'https://api.test';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const summary = {
  displayName: 'Ken',
  email: 'ken@example.com',
  avatarUrl: null,
  memberSince: '2025-01-01T00:00:00.000Z',
  tripsCount: 3,
  countriesCount: 2,
  citiesCount: 5,
  topCities: [],
  topCountries: [],
};

let requests: string[] = [];

const fakeFetch: typeof fetch = async (input, init) => {
  const req = input instanceof Request ? input : new Request(input, init);
  const url = new URL(req.url);
  requests.push(`${req.method} ${url.pathname}${url.search}`);
  if (url.pathname === '/auth/passport') return json(summary);
  throw new Error(`unhandled ${req.url}`);
};

const api = createApiClient(BASE, fakeFetch);

beforeEach(() => {
  requests = [];
});

describe('fetchPassportSummary', () => {
  it('calls GET /auth/passport with no year query when year is null', async () => {
    const result = await fetchPassportSummary(null, api);
    expect(result).toEqual(summary);
    expect(requests).toEqual(['GET /auth/passport']);
  });

  it('calls GET /auth/passport?year= when a year is given', async () => {
    await fetchPassportSummary(2025, api);
    expect(requests).toEqual(['GET /auth/passport?year=2025']);
  });
});
