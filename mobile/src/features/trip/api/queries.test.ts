/** @jest-environment node */
import { createApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import { tokenStore } from '@/auth/tokenStore';

import { HttpError, classifyQueryError, fetchExpenseDetail, fetchTrips } from './queries';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'anon-uuid' }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { variant: 'dev', apiUrl: 'https://api.test', linkHosts: [] } } },
}));

const BASE = 'https://api.test';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const trips = [
  { id: 1, name: 'Da Lat', status: 'ONGOING', memberCount: 3, currency: 'VND' },
  { id: 2, name: 'Tokyo', status: 'PLANNING', memberCount: 2, currency: 'JPY' },
];

let requests: string[] = [];

const fakeFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const url = new URL(request.url);
  requests.push(`${request.method} ${url.pathname}${url.search}`);
  if (url.pathname === '/trips') return json(trips);
  if (url.pathname === '/trips/1/expenses/42') {
    return json({ id: 42, tripId: 1, name: 'Pho', amount: 50000, category: 'FOOD' });
  }
  if (url.pathname === '/trips/1/expenses/404') {
    return json({ statusCode: 404, message: 'Expense not found' }, 404);
  }
  if (url.pathname === '/trips/1/expenses/500') {
    return new Response(null, { status: 500 });
  }
  throw new Error(`unhandled ${request.url}`);
};

const api = createApiClient(BASE, fakeFetch);

beforeEach(async () => {
  requests = [];
  tokenStore._resetForTests();
  await tokenStore.set({
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresIn: 900,
  });
});

describe('fetchTrips', () => {
  it('calls GET /trips once with no status filter and returns the array', async () => {
    const result = await fetchTrips(api);
    expect(result).toEqual(trips);
    expect(requests).toEqual(['GET /trips']);
  });
});

describe('fetchExpenseDetail', () => {
  it('returns the expense on 200', async () => {
    const expense = await fetchExpenseDetail(1, 42, api);
    expect(expense.id).toBe(42);
    expect(requests).toEqual(['GET /trips/1/expenses/42']);
  });

  it('throws an HttpError on 404 that classifies as http/404 with the server message', async () => {
    const err = await fetchExpenseDetail(1, 404, api).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(404);
    expect(classifyQueryError(err)).toMatchObject({
      kind: 'http',
      status: 404,
      message: 'Expense not found',
    });
  });

  it('throws on a bodiless 5xx too', async () => {
    const err = await fetchExpenseDetail(1, 500, api).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(classifyQueryError(err)).toMatchObject({ kind: 'http', status: 500 });
  });
});

describe('classifyQueryError', () => {
  it('passes non-HttpError values straight through to classifyError', () => {
    expect(classifyQueryError(new TypeError('Network request failed')).kind).toBe('offline');
  });
});

describe('keys.trips.expenseDetail', () => {
  it('nests under the trip expenses key so invalidating the list clears details', () => {
    expect(keys.trips.expenseDetail(7, 99)).toEqual(['trips', 7, 'expenses', 99]);
    const list = keys.trips.expenses(7);
    expect(keys.trips.expenseDetail(7, 99).slice(0, list.length)).toEqual([...list]);
  });
});
