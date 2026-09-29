/** @jest-environment node */
import type { TFunction } from 'i18next';

import { createApiClient } from '@/api/client';

import {
  fetchFriendPreview,
  fetchFriendProfile,
  fetchFriendRequests,
  fetchFriends,
  friendCount,
  mutualLabel,
} from './queries';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'anon-uuid' }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { variant: 'dev', apiUrl: 'https://api.test', linkHosts: [] } } },
}));

const BASE = 'https://api.test';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const friend = {
  friendshipId: 1,
  user: { id: 2, displayName: 'Anh', avatarUrl: null, isPro: false },
  mutualFriendCount: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const request = {
  id: 5,
  sender: {
    id: 6,
    displayName: 'Bao',
    avatarUrl: null,
    isPro: true,
    memberSince: '2025-01-01T00:00:00.000Z',
  },
  mutualFriendCount: 1,
  createdAt: '2026-01-02T00:00:00.000Z',
};

const preview = {
  userId: 9,
  displayName: 'Chi',
  avatarUrl: null,
  memberSince: '2025-01-01T00:00:00.000Z',
  mutualFriendCount: 2,
  tripCount: 4,
  countryCount: 1,
  cityCount: 2,
  requestStatus: 'none',
};

const profile = {
  userId: 9,
  displayName: 'Chi',
  avatarUrl: null,
  memberSince: '2025-01-01T00:00:00.000Z',
  tripCount: 4,
  cityCount: 2,
  friendCount: 3,
  requestStatus: 'friends',
  friends: [],
  isPro: false,
};

let requests: string[] = [];

const fakeFetch: typeof fetch = async (input, init) => {
  const req = input instanceof Request ? input : new Request(input, init);
  const url = new URL(req.url);
  requests.push(`${req.method} ${url.pathname}`);
  if (url.pathname === '/friends') return json([friend]);
  if (url.pathname === '/friends/requests') return json([request]);
  if (url.pathname === '/friends/preview/deadbeef') return json(preview);
  if (url.pathname === '/friends/preview/nope') return json({}, 404);
  if (url.pathname === '/friends/profile/9') return json(profile);
  throw new Error(`unhandled ${req.url}`);
};

const api = createApiClient(BASE, fakeFetch);

beforeEach(() => {
  requests = [];
});

describe('fetchFriends', () => {
  it('calls GET /friends and returns the list', async () => {
    const result = await fetchFriends(api);
    expect(result).toEqual([friend]);
    expect(requests).toEqual(['GET /friends']);
  });
});

describe('fetchFriendRequests', () => {
  it('calls GET /friends/requests and returns the list', async () => {
    const result = await fetchFriendRequests(api);
    expect(result).toEqual([request]);
    expect(requests).toEqual(['GET /friends/requests']);
  });
});

describe('fetchFriendPreview', () => {
  it('calls GET /friends/preview/{code}', async () => {
    const result = await fetchFriendPreview('deadbeef', api);
    expect(result).toEqual(preview);
    expect(requests).toEqual(['GET /friends/preview/deadbeef']);
  });

  it('throws on 404', async () => {
    await expect(fetchFriendPreview('nope', api)).rejects.toThrow();
  });
});

describe('fetchFriendProfile', () => {
  it('calls GET /friends/profile/{userId}', async () => {
    const result = await fetchFriendProfile(9, api);
    expect(result).toEqual(profile);
    expect(requests).toEqual(['GET /friends/profile/9']);
  });
});

describe('friendCount', () => {
  it('returns the list length', () => {
    expect(friendCount([friend, friend])).toBe(2);
    expect(friendCount([])).toBe(0);
  });
});

describe('mutualLabel', () => {
  it('formats the mutual-friends count via t', () => {
    const tMock = jest.fn().mockReturnValue('3 mutual friends');
    expect(mutualLabel(3, tMock as unknown as TFunction)).toBe('3 mutual friends');
    expect(tMock).toHaveBeenCalledWith('%lld mutual friends', { count: 3 });
  });
});
