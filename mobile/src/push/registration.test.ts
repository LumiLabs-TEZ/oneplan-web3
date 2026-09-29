/** @jest-environment node */
import { createApiClient } from '@/api/client';
import { useAuthStore } from '@/auth/authStore';
import { tokenStore } from '@/auth/tokenStore';

import {
  PUSH_LAST_LOCALE_KEY,
  PUSH_LAST_TOKEN_KEY,
  type PushRegistrationDeps,
  type PushStorage,
  registerPushToken,
  unregisterPushToken,
} from './registration';

jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { variant: 'dev', apiUrl: 'https://api.test', linkHosts: [] } } },
}));

const BASE = 'https://api.test';

interface Call {
  method: string;
  body: unknown;
}
let calls: Call[] = [];
let respondWith = 201;

const fakeFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const { pathname } = new URL(request.url);
  if (pathname !== '/devices/token') throw new Error(`unhandled ${request.url}`);
  const text = await request.text();
  calls.push({ method: request.method, body: text ? JSON.parse(text) : null });
  const status = request.method === 'DELETE' ? 204 : respondWith;
  return new Response(null, { status });
};

const api = createApiClient(BASE, fakeFetch);

function memoryStorage(): PushStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getString: (k) => map.get(k),
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
}

let storage: ReturnType<typeof memoryStorage>;
let language: 'en' | 'vi' = 'en';
let permission = 'granted';
let requested = 0;
let bgRegistered = 0;

function deps(overrides: Partial<PushRegistrationDeps> = {}): Partial<PushRegistrationDeps> {
  return {
    api,
    storage,
    isDevice: true,
    getPermissions: async () => ({ status: permission }),
    requestPermissions: async () => {
      requested += 1;
      permission = 'granted';
      return { status: permission };
    },
    registerBackgroundTask: async () => {
      bgRegistered += 1;
      return true;
    },
    getToken: async () => 'tok-1',
    platform: 'ios',
    language: () => language,
    ...overrides,
  };
}

beforeEach(async () => {
  calls = [];
  respondWith = 201;
  storage = memoryStorage();
  language = 'en';
  permission = 'granted';
  requested = 0;
  bgRegistered = 0;
  tokenStore._resetForTests();
  useAuthStore.setState({ status: 'authed', ready: true });
  await tokenStore.set({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 });
});

describe('registerPushToken', () => {
  it('first call POSTs {token, platform, locale} and persists both keys', async () => {
    const result = await registerPushToken(deps());
    expect(result).toBe('registered');
    expect(calls).toEqual([
      { method: 'POST', body: { token: 'tok-1', platform: 'ios', locale: 'EN' } },
    ]);
    expect(storage.map.get(PUSH_LAST_TOKEN_KEY)).toBe('tok-1');
    expect(storage.map.get(PUSH_LAST_LOCALE_KEY)).toBe('EN');
    expect(bgRegistered).toBe(1);
  });

  it('same token + locale → skips the POST', async () => {
    await registerPushToken(deps());
    const result = await registerPushToken(deps());
    expect(result).toBe('unchanged');
    expect(calls).toHaveLength(1);
  });

  it('locale change re-POSTs with VN', async () => {
    await registerPushToken(deps());
    language = 'vi';
    const result = await registerPushToken(deps());
    expect(result).toBe('registered');
    expect(calls).toHaveLength(2);
    expect(calls[1]?.body).toEqual({ token: 'tok-1', platform: 'ios', locale: 'VN' });
    expect(storage.map.get(PUSH_LAST_LOCALE_KEY)).toBe('VN');
  });

  it('token rotation re-POSTs', async () => {
    await registerPushToken(deps());
    await registerPushToken(deps({ getToken: async () => 'tok-2', platform: 'android' }));
    expect(calls[1]?.body).toEqual({ token: 'tok-2', platform: 'android', locale: 'EN' });
    expect(storage.map.get(PUSH_LAST_TOKEN_KEY)).toBe('tok-2');
  });

  it('force bypasses the dedupe', async () => {
    await registerPushToken(deps());
    await registerPushToken(deps({ force: true }));
    expect(calls).toHaveLength(2);
  });

  it('non-device → skips everything', async () => {
    const result = await registerPushToken(deps({ isDevice: false }));
    expect(result).toBe('not-device');
    expect(calls).toHaveLength(0);
    expect(storage.map.size).toBe(0);
  });

  it('undetermined → requests permission, then registers', async () => {
    permission = 'undetermined';
    const result = await registerPushToken(deps());
    expect(requested).toBe(1);
    expect(result).toBe('registered');
  });

  it('denied → does not request again, no POST', async () => {
    permission = 'denied';
    const result = await registerPushToken(deps());
    expect(requested).toBe(0);
    expect(result).toBe('permission-denied');
    expect(calls).toHaveLength(0);
  });

  it('server error → failed, nothing persisted (so the next call retries)', async () => {
    respondWith = 500;
    const result = await registerPushToken(deps());
    expect(result).toBe('failed');
    expect(storage.map.size).toBe(0);
    respondWith = 201;
    expect(await registerPushToken(deps())).toBe('registered');
  });

  it('concurrent calls share one run', async () => {
    const [a, b] = await Promise.all([registerPushToken(deps()), registerPushToken(deps())]);
    expect(a).toBe('registered');
    expect(b).toBe('registered');
    expect(calls).toHaveLength(1);
  });
});

describe('unregisterPushToken', () => {
  it('sends DELETE with the last token in the body, then clears both keys', async () => {
    await registerPushToken(deps());
    calls = [];
    await unregisterPushToken({ api, storage, platform: 'ios' });
    expect(calls).toEqual([{ method: 'DELETE', body: { token: 'tok-1', platform: 'ios' } }]);
    expect(storage.map.has(PUSH_LAST_TOKEN_KEY)).toBe(false);
    expect(storage.map.has(PUSH_LAST_LOCALE_KEY)).toBe(false);
  });

  it('no stored token → no network call', async () => {
    await unregisterPushToken({ api, storage, platform: 'ios' });
    expect(calls).toHaveLength(0);
  });

  it('is best-effort: clears keys even when the DELETE throws', async () => {
    storage.set(PUSH_LAST_TOKEN_KEY, 'tok-x');
    storage.set(PUSH_LAST_LOCALE_KEY, 'EN');
    const failing = createApiClient(BASE, async () => {
      throw new Error('offline');
    });
    await unregisterPushToken({ api: failing, storage, platform: 'ios' });
    expect(storage.map.size).toBe(0);
  });
});
