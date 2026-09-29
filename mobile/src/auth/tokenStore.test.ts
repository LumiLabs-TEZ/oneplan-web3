import * as SecureStore from 'expo-secure-store';
import { readLegacySession } from '@/native/legacySession';

import { isAccessTokenExpiring, tokenStore } from './tokenStore';

beforeEach(() => {
  jest.mocked(readLegacySession).mockReset().mockResolvedValue(null);
  tokenStore._resetForTests();
  (jest.requireMock('expo-secure-store') as { __reset: () => void }).__reset();
});

describe('tokenStore', () => {
  it('computes expiresAt from expiresIn and survives hydrate', async () => {
    await tokenStore.set({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 }, 1_000_000);
    expect(tokenStore.get()).toEqual({ accessToken: 'a', refreshToken: 'r', expiresAt: 1_900_000 });
    tokenStore._resetForTests();
    expect(tokenStore.get()).toBeNull();
    await tokenStore.hydrate();
    expect(tokenStore.get()).toEqual({ accessToken: 'a', refreshToken: 'r', expiresAt: 1_900_000 });
  });

  it('clear removes everything and notifies', async () => {
    const seen: unknown[] = [];
    tokenStore.subscribe((t) => seen.push(t));
    await tokenStore.set({ accessToken: 'a', refreshToken: 'r' });
    await tokenStore.clear();
    expect(seen).toEqual([{ accessToken: 'a', refreshToken: 'r', expiresAt: undefined }, null]);
    tokenStore._resetForTests();
    expect(await tokenStore.hydrate()).toBeNull();
  });

  it('returns a cancellation for a superseded write and commits the newest session', async () => {
    const setItem = jest.mocked(SecureStore.setItemAsync);
    const defaultSet = setItem.getMockImplementation()!;
    let releaseFirst!: () => void;
    let firstStarted!: () => void;
    const firstStartedPromise = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    const firstRelease = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    setItem.mockImplementation(async (key, value, options) => {
      if (key === 'oneplan.session.v1' && value.includes('first-access')) {
        firstStarted();
        await firstRelease;
      }
      await defaultSet(key, value, options);
    });

    const first = tokenStore.set({ accessToken: 'first-access', refreshToken: 'first-refresh' });
    await firstStartedPromise;
    const second = tokenStore.set({ accessToken: 'second-access', refreshToken: 'second-refresh' });
    releaseFirst();

    const [firstResult, secondResult] = await Promise.all([first, second]);
    setItem.mockImplementation(defaultSet);

    expect(firstResult.status).toBe('cancelled');
    expect(secondResult.status).toBe('committed');
    expect(tokenStore.get()).toMatchObject({
      accessToken: 'second-access',
      refreshToken: 'second-refresh',
    });
    expect(JSON.parse((await SecureStore.getItemAsync('oneplan.session.v1'))!)).toMatchObject({
      tokens: { accessToken: 'second-access', refreshToken: 'second-refresh' },
    });
  });
});

describe('isAccessTokenExpiring', () => {
  it('true within 60 s, false otherwise or when unknown', () => {
    const now = 10_000_000;
    expect(
      isAccessTokenExpiring(
        { accessToken: 'a', refreshToken: 'r', expiresAt: now + 30_000 },
        60_000,
        now,
      ),
    ).toBe(true);
    expect(
      isAccessTokenExpiring(
        { accessToken: 'a', refreshToken: 'r', expiresAt: now + 120_000 },
        60_000,
        now,
      ),
    ).toBe(false);
    expect(isAccessTokenExpiring({ accessToken: 'a', refreshToken: 'r' }, 60_000, now)).toBe(false);
    expect(isAccessTokenExpiring(null)).toBe(false);
  });
});

describe('native upgrade', () => {
  it('imports the native session and Apple identifier once', async () => {
    jest.mocked(readLegacySession).mockResolvedValue({
      accessToken: 'native-a',
      refreshToken: 'native-r',
      appleUserId: 'apple-id',
    });
    expect(await tokenStore.hydrate()).toEqual({
      accessToken: 'native-a',
      refreshToken: 'native-r',
    });
    expect(tokenStore.getAppleUserId()).toBe('apple-id');
    expect(tokenStore.wasImportedFromNative()).toBe(true);
    tokenStore._resetForTests();
    expect(await tokenStore.hydrate()).toEqual({
      accessToken: 'native-a',
      refreshToken: 'native-r',
    });
    expect(readLegacySession).toHaveBeenCalledTimes(1);
  });

  it('never resurrects the native session after logout', async () => {
    jest.mocked(readLegacySession).mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
    await tokenStore.hydrate();
    await tokenStore.clear();
    tokenStore._resetForTests();
    expect(await tokenStore.hydrate()).toBeNull();
    expect(readLegacySession).toHaveBeenCalledTimes(1);
  });

  it('prefers an existing RN session and does not query legacy storage', async () => {
    await SecureStore.setItemAsync('oneplan.accessToken', 'rn-a');
    await SecureStore.setItemAsync('oneplan.refreshToken', 'rn-r');
    expect(await tokenStore.hydrate()).toMatchObject({ accessToken: 'rn-a', refreshToken: 'rn-r' });
    expect(readLegacySession).not.toHaveBeenCalled();
  });

  it('does not fall back from a partial or corrupt RN session', async () => {
    await SecureStore.setItemAsync('oneplan.accessToken', 'partial');
    expect(await tokenStore.hydrate()).toBeNull();
    tokenStore._resetForTests();
    await SecureStore.setItemAsync('oneplan.session.v1', '{broken');
    expect(await tokenStore.hydrate()).toBeNull();
    expect(readLegacySession).not.toHaveBeenCalled();
  });

  it('leaves unreadable legacy storage intact and retryable', async () => {
    jest.mocked(readLegacySession).mockRejectedValueOnce(new Error('unavailable'));
    expect(await tokenStore.hydrate()).toBeNull();
    tokenStore._resetForTests();
    jest.mocked(readLegacySession).mockResolvedValueOnce({ accessToken: 'a', refreshToken: 'r' });
    expect(await tokenStore.hydrate()).not.toBeNull();
  });

  it('does not expose an import that failed to persist; retries next launch', async () => {
    jest.mocked(readLegacySession).mockResolvedValue({ accessToken: 'a', refreshToken: 'r' });
    jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error('unavailable'));
    await expect(tokenStore.hydrate()).rejects.toThrow('unavailable');
    expect(tokenStore.get()).toBeNull();
    tokenStore._resetForTests();
    expect(await tokenStore.hydrate()).not.toBeNull();
  });

  it('serializes an interrupted import before a racing logout', async () => {
    let resolve!: (value: { accessToken: string; refreshToken: string }) => void;
    jest.mocked(readLegacySession).mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const hydration = tokenStore.hydrate();
    // Allow queued storage reads to reach the native bridge.
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const logout = tokenStore.clear();
    resolve({ accessToken: 'a', refreshToken: 'r' });
    await Promise.all([hydration, logout]);
    tokenStore._resetForTests();
    expect(await tokenStore.hydrate()).toBeNull();
  });
});
