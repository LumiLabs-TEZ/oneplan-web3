/** @jest-environment node */
import { createApiClient } from '@/api/client';
import { useAuthStore } from '@/auth/authStore';
import { tokenStore } from '@/auth/tokenStore';

import { AnalyticsClient, MAX_BATCH, MAX_QUEUE } from './client';
import { currentSessionId, setCurrentSessionId } from './session';
import { INACTIVITY_TIMEOUT_MS, type SessionStorage } from './sessionTracker';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'anon-uuid' }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));

const BASE = 'https://api.test';
const T0 = Date.UTC(2026, 8, 13, 10, 0, 0);

interface Call {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

let calls: Call[] = [];
let sessionsStatus = 204;
let eventsStatus = 204;
let endStatus = 204;

const fakeFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const { pathname } = new URL(request.url);
  const text = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((v, k) => {
    headers[k] = v;
  });
  calls.push({
    method: request.method,
    path: pathname,
    headers,
    body: text ? JSON.parse(text) : null,
  });
  if (pathname === '/analytics/sessions') return new Response(null, { status: sessionsStatus });
  if (pathname === '/analytics/events') return new Response(null, { status: eventsStatus });
  if (/^\/analytics\/sessions\/[^/]+\/end$/.test(pathname))
    return new Response(null, { status: endStatus });
  throw new Error(`unhandled ${request.url}`);
};

const api = createApiClient(BASE, fakeFetch);

function fakeStorage(): SessionStorage {
  const map = new Map<string, string | number>();
  return {
    getString: (k) => (typeof map.get(k) === 'string' ? (map.get(k) as string) : undefined),
    getNumber: (k) => (typeof map.get(k) === 'number' ? (map.get(k) as number) : undefined),
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
}

let now = T0;
let uuidCounter = 0;

function makeClient(storage: SessionStorage = fakeStorage()) {
  return new AnalyticsClient({
    api,
    storage,
    now: () => now,
    uuid: () => `session-${++uuidCounter}`,
    platform: 'ios',
    appVersion: '1.5.0',
    osVersion: '26.0',
  });
}

const eventsCalls = () => calls.filter((c) => c.path === '/analytics/events');
const sessionCalls = () => calls.filter((c) => c.path === '/analytics/sessions');
const endCalls = () => calls.filter((c) => c.method === 'PATCH');
const bodyEvents = (c: Call) => (c.body as { events: { eventName: string }[] }).events;

function setAuthed(authed: boolean) {
  useAuthStore.setState({ status: authed ? 'authed' : 'anon', ready: true });
}

/** Registers a fresh session and drains the APP_OPEN it produces. */
async function registeredClient() {
  setAuthed(true);
  const client = makeClient();
  client.onForeground();
  await client.whenIdle();
  calls = [];
  return client;
}

let warnSpy: jest.SpyInstance;

beforeEach(async () => {
  calls = [];
  sessionsStatus = 204;
  eventsStatus = 204;
  endStatus = 204;
  now = T0;
  uuidCounter = 0;
  setCurrentSessionId(null);
  tokenStore._resetForTests();
  await tokenStore.set({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 });
  setAuthed(true);
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('session registration', () => {
  it('registers a new session once, tracks APP_OPEN, then sends x-session-id on events', async () => {
    const client = makeClient();
    client.onForeground();
    await client.whenIdle();

    expect(sessionCalls()).toHaveLength(1);
    expect(sessionCalls()[0]?.body).toEqual({
      id: 'session-1',
      platform: 'ios',
      appVersion: '1.5.0',
      osVersion: '26.0',
      anonymousId: 'anon-uuid',
      startedAt: new Date(T0).toISOString(),
    });
    // the registration request itself does not yet carry the session header
    expect(sessionCalls()[0]?.headers['x-session-id']).toBeUndefined();
    expect(currentSessionId()).toBe('session-1');

    expect(eventsCalls()).toHaveLength(1);
    expect(bodyEvents(eventsCalls()[0]!)).toEqual([
      { eventName: 'APP_OPEN', occurredAt: new Date(T0).toISOString() },
    ]);
    expect(eventsCalls()[0]?.headers['x-session-id']).toBe('session-1');
    expect(eventsCalls()[0]?.headers.authorization).toBe('Bearer access');

    // second foreground within the window: no new session, no re-registration, no APP_OPEN
    now = T0 + 5 * 60_000;
    client.onForeground();
    await client.whenIdle();
    expect(sessionCalls()).toHaveLength(1);
    expect(eventsCalls()).toHaveLength(1);
    expect(client.pending).toHaveLength(0);
  });

  it('does not send events before the session is registered (unauthed), then catches up on auth', async () => {
    setAuthed(false);
    const client = makeClient();
    client.onForeground();
    client.track('MARKET_OPENED');
    await client.whenIdle();

    expect(calls).toHaveLength(0);
    expect(client.pending.map((e) => e.eventName)).toEqual(['APP_OPEN', 'MARKET_OPENED']);
    expect(currentSessionId()).toBeNull();

    setAuthed(true);
    client.onAuthChanged('authed');
    await client.whenIdle();

    expect(sessionCalls()).toHaveLength(1);
    expect(eventsCalls()).toHaveLength(1);
    expect(bodyEvents(eventsCalls()[0]!).map((e) => e.eventName)).toEqual([
      'APP_OPEN',
      'MARKET_OPENED',
    ]);
    expect(eventsCalls()[0]?.headers['x-session-id']).toBe('session-1');
    expect(client.pending).toHaveLength(0);
  });

  it('retries registration on the next foreground when the POST failed', async () => {
    sessionsStatus = 500;
    const client = makeClient();
    client.onForeground();
    await client.whenIdle();
    expect(sessionCalls()).toHaveLength(1);
    expect(eventsCalls()).toHaveLength(0);
    expect(currentSessionId()).toBeNull();

    sessionsStatus = 204;
    now = T0 + 1_000;
    client.onForeground();
    await client.whenIdle();
    expect(sessionCalls()).toHaveLength(2);
    expect(sessionCalls()[1]?.body).toMatchObject({ id: 'session-1' });
    // only one APP_OPEN: a registration retry is not a new session
    expect(eventsCalls()).toHaveLength(1);
    expect(bodyEvents(eventsCalls()[0]!).map((e) => e.eventName)).toEqual(['APP_OPEN']);
  });

  it('rotates the session and tracks APP_OPEN again after 30 minutes in background', async () => {
    const client = await registeredClient();
    client.onBackground();
    await client.whenIdle();
    now = T0 + INACTIVITY_TIMEOUT_MS;
    client.onForeground();
    await client.whenIdle();

    expect(sessionCalls()).toHaveLength(1);
    expect(sessionCalls()[0]?.body).toMatchObject({ id: 'session-2' });
    expect(currentSessionId()).toBe('session-2');
    expect(eventsCalls()).toHaveLength(1);
    expect(bodyEvents(eventsCalls()[0]!)).toEqual([
      { eventName: 'APP_OPEN', occurredAt: new Date(now).toISOString() },
    ]);
    expect(eventsCalls()[0]?.headers['x-session-id']).toBe('session-2');
  });

  it('restores a registered session from storage across a relaunch', async () => {
    const storage = fakeStorage();
    setAuthed(true);
    const first = new AnalyticsClient({
      api,
      storage,
      now: () => now,
      uuid: () => 'persisted-session',
      platform: 'android',
    });
    first.onForeground();
    await first.whenIdle();
    first.onBackground();
    await first.whenIdle();
    calls = [];
    setCurrentSessionId(null);

    now = T0 + 60_000;
    const second = new AnalyticsClient({
      api,
      storage,
      now: () => now,
      uuid: () => 'should-not-be-used',
      platform: 'android',
    });
    second.onForeground();
    await second.whenIdle();
    expect(sessionCalls()).toHaveLength(0);
    expect(eventsCalls()).toHaveLength(0);
    expect(currentSessionId()).toBe('persisted-session');
  });
});

describe('background', () => {
  it('PATCHes the session end with the current time', async () => {
    const client = await registeredClient();
    now = T0 + 42_000;
    client.onBackground();
    await new Promise((r) => setTimeout(r, 0));

    expect(endCalls()).toHaveLength(1);
    expect(endCalls()[0]?.path).toBe('/analytics/sessions/session-1/end');
    expect(endCalls()[0]?.body).toEqual({ endedAt: new Date(now).toISOString() });
    expect(endCalls()[0]?.headers['x-session-id']).toBe('session-1');
  });

  it('does not PATCH end for an unregistered session', async () => {
    setAuthed(false);
    const client = makeClient();
    client.onForeground();
    client.onBackground();
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toHaveLength(0);
  });
});

describe('auth changes', () => {
  it('signing out drops the session header and forces re-registration on next login', async () => {
    const client = await registeredClient();
    setAuthed(false);
    client.onAuthChanged('anon');
    expect(currentSessionId()).toBeNull();

    client.track('MARKET_OPENED');
    await client.whenIdle();
    expect(calls).toHaveLength(0);
    expect(client.pending).toHaveLength(1);

    setAuthed(true);
    client.onAuthChanged('authed');
    await client.whenIdle();
    expect(sessionCalls()).toHaveLength(1);
    expect(sessionCalls()[0]?.body).toMatchObject({ id: 'session-1' });
    expect(eventsCalls()).toHaveLength(1);
    expect(currentSessionId()).toBe('session-1');
  });
});

describe('queue', () => {
  it('batches synchronous bursts into requests of at most 50 events', async () => {
    const client = await registeredClient();
    for (let i = 0; i < 60; i += 1) client.track('PLAN_VIEWED', { i });
    await client.whenIdle();

    const sizes = eventsCalls().map((c) => bodyEvents(c).length);
    expect(sizes).toEqual([MAX_BATCH, 10]);
    expect(client.pending).toHaveLength(0);
    for (const c of eventsCalls()) expect(c.headers['x-session-id']).toBe('session-1');
  });

  it('drops the oldest event once the queue holds 500', async () => {
    setAuthed(false);
    const client = makeClient();
    for (let i = 0; i < MAX_QUEUE + 3; i += 1) client.track('PLAN_VIEWED', { i });
    await client.whenIdle();

    expect(client.pending).toHaveLength(MAX_QUEUE);
    expect(client.pending[0]?.properties).toEqual({ i: 3 });
    expect(client.pending[MAX_QUEUE - 1]?.properties).toEqual({ i: MAX_QUEUE + 2 });
    expect(calls).toHaveLength(0);
  });

  it('keeps a failed batch queued and retries it on the next track', async () => {
    const client = await registeredClient();
    eventsStatus = 500;
    client.track('MARKET_OPENED');
    await client.whenIdle();
    expect(eventsCalls()).toHaveLength(1);
    expect(client.pending.map((e) => e.eventName)).toEqual(['MARKET_OPENED']);

    eventsStatus = 204;
    client.track('PLAN_VIEWED', { listingId: 7 });
    await client.whenIdle();
    expect(eventsCalls()).toHaveLength(2);
    expect(bodyEvents(eventsCalls()[1]!)).toEqual([
      { eventName: 'MARKET_OPENED', occurredAt: new Date(T0).toISOString() },
      {
        eventName: 'PLAN_VIEWED',
        occurredAt: new Date(T0).toISOString(),
        properties: { listingId: 7 },
      },
    ]);
    expect(client.pending).toHaveLength(0);
  });

  it('survives a thrown fetch error and retries later', async () => {
    const client = await registeredClient();
    const throwingApi = createApiClient(BASE, async () => {
      throw new Error('offline');
    });
    const offline = new AnalyticsClient({
      api: throwingApi,
      storage: fakeStorage(),
      now: () => now,
      uuid: () => 'x',
      platform: 'ios',
    });
    offline.onForeground();
    await offline.whenIdle();
    expect(offline.pending.map((e) => e.eventName)).toEqual(['APP_OPEN']);
    expect(currentSessionId()).toBe('session-1'); // untouched by the failed client
    expect(client.pending).toHaveLength(0);
  });
});

describe('track validation', () => {
  it('drops events the server does not accept from clients', async () => {
    const client = await registeredClient();
    client.track('SCAN_PACK_PURCHASED', { amount: 5 });
    client.track('nonsense');
    await client.whenIdle();
    expect(client.pending).toHaveLength(0);
    expect(eventsCalls()).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('drops non-primitive property values but keeps the event', async () => {
    const client = await registeredClient();
    client.track('PINS_SAVED', {
      count: 3,
      source: 'tiktok',
      ok: true,
      nothing: null,
      skipped: undefined,
      nested: { a: 1 },
      list: [1, 2],
      nan: Number.NaN,
      fn: () => 1,
    });
    await client.whenIdle();
    expect(bodyEvents(eventsCalls()[0]!)[0]).toEqual({
      eventName: 'PINS_SAVED',
      occurredAt: new Date(T0).toISOString(),
      properties: { count: 3, source: 'tiktok', ok: true, nothing: null },
    });
    expect(warnSpy).toHaveBeenCalledTimes(4);
  });

  it('omits properties entirely when nothing survives sanitising', async () => {
    const client = await registeredClient();
    client.track('BOARD_OPENED', { nested: {} });
    await client.whenIdle();
    expect(bodyEvents(eventsCalls()[0]!)[0]).toEqual({
      eventName: 'BOARD_OPENED',
      occurredAt: new Date(T0).toISOString(),
    });
  });
});
