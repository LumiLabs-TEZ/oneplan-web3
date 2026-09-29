/** @jest-environment node */
import * as SecureStore from 'expo-secure-store';
import { createApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import { queryClient } from '@/api/queryClient';
import { installInviteSignOutHook } from '@/features/invite/signOutHook';
import { pendingInvitesStore, usePendingInvitesStore } from '@/features/invite/pendingInvitesStore';
import { installLinksSignOutHook } from '@/links/signOutHook';
import { pendingLinkStore, usePendingLinkStore } from '@/links/pendingLinkStore';
import { mmkvQueryStorage } from '@/offline/persister';
import { installRealtimeSignOutHook } from '@/realtime/signOutHook';
import { useRealtimeStore } from '@/realtime/realtimeStore';

import { useAuthStore } from './authStore';
import {
  clearLocalSession,
  completeSignIn,
  SignInSessionCancelledError,
  signOutEverywhere,
} from './session';
import { _resetSignOutHooksForTests, registerSignOutHook } from './signOutHooks';
import { tokenStore } from './tokenStore';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { variant: 'dev', apiUrl: 'http://x', linkHosts: [] } } },
}));

type Call = { method: string; path: string; body: string; auth: string | null };
let calls: Call[] = [];
let events: string[] = [];
let logoutStatus = 204;

const fakeFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const { pathname } = new URL(request.url);
  calls.push({
    method: request.method,
    path: pathname,
    body: await request.text(),
    auth: request.headers.get('authorization'),
  });
  events.push(`fetch ${pathname}`);
  if (pathname === '/auth/logout') return new Response(null, { status: logoutStatus });
  throw new Error(`unhandled ${request.url}`);
};

const api = createApiClient('http://x', fakeFetch);

beforeEach(async () => {
  calls = [];
  events = [];
  logoutStatus = 204;
  _resetSignOutHooksForTests();
  tokenStore._resetForTests();
  queryClient.clear();
  useAuthStore.setState({ status: 'authed', ready: true });
  await tokenStore.set({ accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 900 });
});

afterAll(() => queryClient.clear());

describe('signOutEverywhere', () => {
  it('runs hooks first, then POSTs /auth/logout with the refresh token, then clears locally', async () => {
    registerSignOutHook(async () => {
      events.push('hook');
    });
    queryClient.setQueryData(keys.me, { id: 1 });

    await signOutEverywhere({ api });

    expect(events).toEqual(['hook', 'fetch /auth/logout']);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/auth/logout',
      auth: 'Bearer access-1',
    });
    expect(JSON.parse(calls[0]!.body)).toEqual({ refreshToken: 'refresh-1' });
    expect(tokenStore.get()).toBeNull();
    expect(useAuthStore.getState().status).toBe('anon');
    expect(queryClient.getQueryData(keys.me)).toBeUndefined();
  });

  it('still signs out locally when /auth/logout returns 500', async () => {
    logoutStatus = 500;
    await signOutEverywhere({ api });
    expect(calls.map((c) => c.path)).toEqual(['/auth/logout']);
    expect(tokenStore.get()).toBeNull();
    expect(useAuthStore.getState().status).toBe('anon');
  });

  it('still signs out (and still calls logout) when a hook throws', async () => {
    registerSignOutHook(async () => {
      throw new Error('push unregister failed');
    });
    registerSignOutHook(async () => {
      events.push('hook-2');
    });
    await signOutEverywhere({ api });
    expect(events).toEqual(['hook-2', 'fetch /auth/logout']);
    expect(tokenStore.get()).toBeNull();
    expect(useAuthStore.getState().status).toBe('anon');
  });

  it('skips the logout request when there is no refresh token', async () => {
    tokenStore._resetForTests();
    useAuthStore.setState({ status: 'authed' });
    await signOutEverywhere({ api });
    expect(calls).toHaveLength(0);
    expect(useAuthStore.getState().status).toBe('anon');
  });

  it('wipes persisted query rows, not just the in-memory cache', async () => {
    mmkvQueryStorage.setItem('oneplan.query-abc', '{"old":"user"}');
    await signOutEverywhere({ api });
    expect(mmkvQueryStorage.entries?.()).toEqual([]);
  });

  it('runs the realtime, invite and links sign-out hooks (installed like _layout.tsx does)', async () => {
    installRealtimeSignOutHook();
    installInviteSignOutHook();
    installLinksSignOutHook();

    useRealtimeStore.setState({ state: 'connected', lastTripEnded: { tripId: 1 } });
    usePendingInvitesStore.setState({
      invites: [
        { inviteCode: 'abc', tripName: 't', coverImageUrl: null, invitedByDisplayName: 'a' },
      ],
      queue: ['abc'],
      activeCode: 'abc',
    });
    usePendingLinkStore.setState({ pending: { kind: 'tripInvite', inviteCode: 'abc' } });

    await signOutEverywhere({ api });

    expect(useRealtimeStore.getState().state).toBe('disconnected');
    expect(useRealtimeStore.getState().lastTripEnded).toBeNull();
    expect(pendingInvitesStore.peekActive()).toBeNull();
    expect(usePendingInvitesStore.getState().invites).toEqual([]);
    expect(pendingLinkStore.peek()).toBeNull();
  });
});

describe('clearLocalSession', () => {
  it('makes no network call, clears tokens + cache and sets status expired', () => {
    queryClient.setQueryData(keys.me, { id: 1 });
    clearLocalSession();
    expect(calls).toHaveLength(0);
    expect(tokenStore.get()).toBeNull();
    expect(useAuthStore.getState().status).toBe('expired');
    expect(queryClient.getQueryData(keys.me)).toBeUndefined();
  });

  it('runs the sign-out hooks best-effort for the expired reason (iOS bug: expired path skipped them)', async () => {
    registerSignOutHook(async () => {
      events.push('hook');
    });

    clearLocalSession('expired');
    // `clearLocalSession` fires the hooks without awaiting them (no network on this path).
    await Promise.resolve();
    await Promise.resolve();

    expect(events).toEqual(['hook']);
    expect(tokenStore.get()).toBeNull();
    expect(useAuthStore.getState().status).toBe('expired');
  });

  it('does not re-run hooks for the user reason (signOutEverywhere already ran them)', async () => {
    registerSignOutHook(async () => {
      events.push('hook');
    });

    clearLocalSession('user');
    await Promise.resolve();
    await Promise.resolve();

    expect(events).toEqual([]);
    expect(useAuthStore.getState().status).toBe('anon');
  });
});

describe('completeSignIn', () => {
  it('stores tokens with expiry, marks authed and invalidates `me` + subscription status', async () => {
    tokenStore._resetForTests();
    useAuthStore.setState({ status: 'anon' });
    queryClient.setQueryData(keys.me, { id: 1 });
    const spy = jest.spyOn(queryClient, 'invalidateQueries');

    await completeSignIn({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 900,
      user: { id: 1, email: 'e', displayName: 'd', avatarUrl: null },
    });

    expect(tokenStore.get()).toMatchObject({ accessToken: 'a', refreshToken: 'r' });
    expect(tokenStore.get()?.expiresAt).toBeGreaterThan(Date.now());
    expect(useAuthStore.getState().status).toBe('authed');
    expect(spy).toHaveBeenCalledWith({ queryKey: keys.me });
    expect(spy).toHaveBeenCalledWith({ queryKey: keys.subscription.status });
    spy.mockRestore();
  });

  it('does not publish auth state when logout supersedes persistence', async () => {
    const setItem = jest.mocked(SecureStore.setItemAsync);
    const defaultSet = setItem.getMockImplementation()!;
    let release!: () => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const releasePromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    setItem.mockImplementation(async (key, value, options) => {
      if (key === 'oneplan.session.v1' && value.includes('signin-access')) {
        started();
        await releasePromise;
      }
      await defaultSet(key, value, options);
    });

    const signIn = completeSignIn({
      accessToken: 'signin-access',
      refreshToken: 'signin-refresh',
      expiresIn: 900,
      user: { id: 1, email: 'e', displayName: 'd', avatarUrl: null },
    });
    await startedPromise;

    clearLocalSession('user');
    expect(useAuthStore.getState().status).toBe('anon');
    release();

    await expect(signIn).rejects.toBeInstanceOf(SignInSessionCancelledError);
    // Queue behind the logout to observe its durable tombstone.
    await tokenStore.hydrate();
    setItem.mockImplementation(defaultSet);

    expect(useAuthStore.getState().status).toBe('anon');
    expect(tokenStore.get()).toBeNull();
    expect(JSON.parse((await SecureStore.getItemAsync('oneplan.session.v1'))!)).toMatchObject({
      tokens: null,
    });
  });

  it('keeps the anonymous state when secure persistence fails', async () => {
    tokenStore._resetForTests();
    useAuthStore.setState({ status: 'anon' });
    jest
      .mocked(SecureStore.setItemAsync)
      .mockRejectedValueOnce(new Error('secure store unavailable'));

    await expect(
      completeSignIn({
        accessToken: 'failed-access',
        refreshToken: 'failed-refresh',
        expiresIn: 900,
        user: { id: 1, email: 'e', displayName: 'd', avatarUrl: null },
      }),
    ).rejects.toThrow('secure store unavailable');

    expect(useAuthStore.getState().status).toBe('anon');
    expect(tokenStore.get()).toBeNull();
  });
});
