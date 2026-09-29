/** @jest-environment node */
import { useAuthStore } from '@/auth/authStore';
import { _resetSignOutHooksForTests, registerSignOutHook } from '@/auth/signOutHooks';
import { tokenStore } from '@/auth/tokenStore';

import { createApiClient } from './client';
import { _resetRefreshForTests, refreshOnce } from './refresh';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'anon-uuid' }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { variant: 'dev', apiUrl: 'https://api.test', linkHosts: [] } } },
}));

const BASE = 'https://api.test';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const okRefresh = () =>
  json({ accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 900, user: {} });

let refreshCalls = 0;
let refreshResponder: () => Response = okRefresh;
let validAccess = 'old-access';
let meCalls: { auth: string | null; body: string }[] = [];

/** Fake network: /auth/refresh, /echo (401 unless bearer matches), /auth/social (always 401). */
const fakeFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const { pathname } = new URL(request.url);
  if (pathname === '/auth/refresh') {
    refreshCalls += 1;
    await new Promise((r) => setTimeout(r, 20));
    return refreshResponder();
  }
  if (pathname === '/auth/social') return new Response(null, { status: 401 });
  if (pathname === '/echo') {
    const auth = request.headers.get('authorization');
    meCalls.push({ auth, body: await request.text() });
    if (auth !== `Bearer ${validAccess}`) return new Response(null, { status: 401 });
    return json({ ok: true, lang: request.headers.get('accept-language') });
  }
  throw new Error(`unhandled ${request.url}`);
};

function install(access: string) {
  validAccess = access;
}

// openapi-fetch is typed against the real spec; use a loose client for the fake routes.
const client = createApiClient(BASE, fakeFetch) as any;

beforeEach(async () => {
  refreshCalls = 0;
  meCalls = [];
  refreshResponder = okRefresh;
  tokenStore._resetForTests();
  _resetRefreshForTests();
  _resetSignOutHooksForTests();
  useAuthStore.setState({ status: 'authed', ready: true });
  await tokenStore.set({ accessToken: 'old-access', refreshToken: 'old-refresh', expiresIn: 900 });
});

describe('auth middleware', () => {
  it('attaches the four headers', async () => {
    install('old-access');
    const { data } = await client.GET('/echo');
    expect(data).toEqual({ ok: true, lang: 'en' });
    expect(meCalls[0]?.auth).toBe('Bearer old-access');
  });

  it('5 concurrent 401s → exactly one refresh, all retried with the new token', async () => {
    install('new-access');
    const results = await Promise.all(
      Array.from({ length: 5 }, () => client.POST('/echo', { body: { n: 1 } })),
    );
    expect(refreshCalls).toBe(1);
    for (const r of results) expect(r.response.status).toBe(200);
    expect(tokenStore.get()?.accessToken).toBe('new-access');
    expect(tokenStore.get()?.expiresAt).toBeGreaterThan(Date.now());
  });

  it('replays the POST body byte-for-byte on retry', async () => {
    install('new-access');
    await client.POST('/echo', { body: { hello: 'world', n: [1, 2] } });
    const bodies = meCalls.map((c) => c.body);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect(JSON.parse(bodies[1]!)).toEqual({ hello: 'world', n: [1, 2] });
  });

  it('multipart upload: refreshes on 401 but does not buffer or replay the body', async () => {
    install('new-access');
    const form = new FormData();
    form.append('file', new Blob(['x'.repeat(1024)]), 'receipt.jpg');
    const { response } = await client.POST('/echo', {
      body: form,
      bodySerializer: (b: FormData) => b,
    });
    expect(response.status).toBe(401);
    expect(refreshCalls).toBe(1);
    expect(meCalls).toHaveLength(1);
    expect(tokenStore.get()?.accessToken).toBe('new-access');
    expect(useAuthStore.getState().status).toBe('authed');
  });

  it('second 401 after refresh → signOut(expired)', async () => {
    install('some-other-token');
    const { response } = await client.GET('/echo');
    expect(response.status).toBe(401);
    expect(refreshCalls).toBe(1);
    expect(useAuthStore.getState().status).toBe('expired');
    expect(tokenStore.get()).toBeNull();
  });

  it('second 401 after refresh also runs the sign-out hooks best-effort (no network)', async () => {
    const hookCalls: string[] = [];
    registerSignOutHook(async () => {
      hookCalls.push('hook');
    });
    install('some-other-token');

    await client.GET('/echo');
    // `handleAuthExpired` fires the hooks without awaiting them.
    await Promise.resolve();
    await Promise.resolve();

    expect(hookCalls).toEqual(['hook']);
    expect(useAuthStore.getState().status).toBe('expired');
  });

  it('refresh failure → signOut(expired), no retry', async () => {
    refreshResponder = () => new Response(null, { status: 401 });
    install('new-access');
    const { response } = await client.GET('/echo');
    expect(response.status).toBe(401);
    expect(meCalls).toHaveLength(1);
    expect(useAuthStore.getState().status).toBe('expired');
  });

  it('does not refresh for /auth/social', async () => {
    install('old-access');
    const { response } = await client.POST('/auth/social', { body: {} });
    expect(response.status).toBe(401);
    expect(refreshCalls).toBe(0);
    expect(useAuthStore.getState().status).toBe('authed');
  });

  it('refreshes proactively when the token is about to expire', async () => {
    install('new-access');
    await tokenStore.set({ accessToken: 'old-access', refreshToken: 'old-refresh', expiresIn: 30 });
    const { response } = await client.GET('/echo');
    expect(response.status).toBe(200);
    expect(refreshCalls).toBe(1);
    expect(meCalls).toHaveLength(1);
    expect(meCalls[0]?.auth).toBe('Bearer new-access');
  });

  it('does not resurrect a session when logout supersedes an in-flight refresh', async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const refresh = refreshOnce(BASE, async () => {
      await blocked;
      return okRefresh();
    });

    const clear = tokenStore.clear();
    release();

    await expect(refresh).resolves.toBeNull();
    await clear;
    expect(tokenStore.get()).toBeNull();
    expect(useAuthStore.getState().status).toBe('authed');
  });

  it('no refresh token → signOut immediately', async () => {
    install('nope');
    tokenStore._resetForTests();
    await tokenStore.set({ accessToken: 'stale', refreshToken: '' });
    await client.GET('/echo');
    expect(refreshCalls).toBe(0);
    expect(useAuthStore.getState().status).toBe('expired');
  });
});
