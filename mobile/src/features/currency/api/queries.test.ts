/** @jest-environment node */
import { createApiClient } from '@/api/client';

import { CURRENCY_CATALOG_FALLBACK, fetchCurrencies } from './queries';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'anon-uuid' }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { variant: 'dev', apiUrl: 'https://api.test', linkHosts: [] } } },
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let requests: string[] = [];

function apiReturning(respond: () => Response) {
  const fakeFetch: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    requests.push(`${request.method} ${url.pathname}`);
    return respond();
  };
  return createApiClient('https://api.test', fakeFetch);
}

beforeEach(() => {
  requests = [];
});

describe('CURRENCY_CATALOG_FALLBACK', () => {
  it('mirrors the static catalog, VND first', () => {
    expect(CURRENCY_CATALOG_FALLBACK).toHaveLength(10);
    expect(CURRENCY_CATALOG_FALLBACK[0]).toEqual({
      code: 'VND',
      name: 'Vietnamese Dong',
      symbol: 'đ',
      decimalPlaces: 0,
    });
  });
});

describe('fetchCurrencies', () => {
  it('GETs /currencies and returns the catalog', async () => {
    const api = apiReturning(() =>
      json([{ code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 }]),
    );
    await expect(fetchCurrencies(api)).resolves.toEqual([
      { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
    ]);
    expect(requests).toEqual(['GET /currencies']);
  });

  it('throws an HttpError when the request fails', async () => {
    const api = apiReturning(() => json({ message: 'boom' }, 500));
    await expect(fetchCurrencies(api)).rejects.toThrow(/GET \/currencies/);
  });
});
