/** @jest-environment node */
import { createApiClient } from '@/api/client';
import { tokenStore } from '@/auth/tokenStore';

import { fetchInvitePreview, fetchPendingInvites } from './queries';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'anon-uuid' }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { variant: 'dev', apiUrl: 'https://api.test', linkHosts: [] } } },
}));

const BASE = 'https://api.test';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const invites = [
  { inviteCode: 'AAA', tripName: 'Da Lat', coverImageUrl: null, invitedByDisplayName: 'Ken' },
  {
    inviteCode: 'BBB',
    tripName: 'Hanoi',
    coverImageUrl: 'https://img/1.jpg',
    invitedByDisplayName: '',
  },
];

const preview = {
  tripId: 7,
  name: 'Da Lat',
  coverImageUrl: null,
  memberCount: 3,
  status: 'PLANNING',
  isMember: false,
};

let requests: string[] = [];

const fakeFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const url = new URL(request.url);
  requests.push(`${request.method} ${url.pathname}`);
  if (url.pathname === '/trips/invites/pending') return json(invites);
  if (url.pathname === '/trips/invites/pending-empty') return json([]);
  if (url.pathname === '/trips/join/ABC123/preview') return json(preview);
  if (url.pathname === '/trips/join/NOPE12/preview') return json({ statusCode: 404 }, 404);
  throw new Error(`unhandled ${request.url}`);
};

const api = createApiClient(BASE, fakeFetch);

beforeEach(async () => {
  requests = [];
  tokenStore._resetForTests();
  await tokenStore.set({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 });
});

describe('fetchPendingInvites', () => {
  it('calls GET /trips/invites/pending and returns the array', async () => {
    const result = await fetchPendingInvites(api);
    expect(result).toEqual(invites);
    expect(requests).toEqual(['GET /trips/invites/pending']);
  });

  it('throws on a non-2xx response', async () => {
    const failingFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ statusCode: 500 }), { status: 500 });
    const failingApi = createApiClient(BASE, failingFetch);
    await expect(fetchPendingInvites(failingApi)).rejects.toThrow();
  });
});

describe('fetchInvitePreview', () => {
  it('calls GET /trips/join/{code}/preview and returns the DTO', async () => {
    const result = await fetchInvitePreview('ABC123', api);
    expect(result).toEqual(preview);
    expect(requests).toEqual(['GET /trips/join/ABC123/preview']);
  });

  it('throws on an unknown invite code', async () => {
    await expect(fetchInvitePreview('NOPE12', api)).rejects.toThrow();
  });
});
