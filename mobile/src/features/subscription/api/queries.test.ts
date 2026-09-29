/** @jest-environment node */
import { createApiClient } from '@/api/client';
import { tokenStore } from '@/auth/tokenStore';

import { fetchSubscriptionStatus } from './queries';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'anon-uuid' }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { variant: 'dev', apiUrl: 'https://api.test', linkHosts: [] } } },
}));

const BASE = 'https://api.test';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const proStatus = {
  status: 'ACTIVE',
  tier: 'pro_monthly',
  productId: 'pro_monthly',
  expiresAt: '2026-05-12T00:00:00.000Z',
  autoRenewEnabled: true,
  gracePeriodExpiresAt: null,
};

let requests: string[] = [];

const fakeFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const url = new URL(request.url);
  requests.push(`${request.method} ${url.pathname}`);
  if (url.pathname === '/subscription/status') return json(proStatus);
  if (url.pathname === '/subscription/status-500') return json({ statusCode: 500 }, 500);
  throw new Error(`unhandled ${request.url}`);
};

const api = createApiClient(BASE, fakeFetch);

beforeEach(async () => {
  requests = [];
  tokenStore._resetForTests();
  await tokenStore.set({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 });
});

describe('fetchSubscriptionStatus', () => {
  it('calls GET /subscription/status and returns the DTO', async () => {
    const result = await fetchSubscriptionStatus(api);
    expect(result).toEqual(proStatus);
    expect(requests).toEqual(['GET /subscription/status']);
  });

  it('throws on a non-2xx response', async () => {
    const failingApi = createApiClient(BASE, (async () =>
      json({ statusCode: 500 }, 500)) as typeof fetch);
    await expect(fetchSubscriptionStatus(failingApi)).rejects.toThrow();
  });
});
