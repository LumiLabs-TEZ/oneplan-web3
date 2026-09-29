import * as SecureStore from 'expo-secure-store';

import { readLegacySession } from '@/native/legacySession';

/**
 * Keychain/Keystore-backed token store (port of AuthTokenStore.swift) with an
 * in-memory mirror so the request middleware can read synchronously.
 * Unlike iOS/web/Android we keep `expiresAt` so the client can refresh
 * proactively instead of waiting for a 401.
 */
export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** epoch ms; `undefined` when the server response had no `expiresIn`. */
  expiresAt?: number;
}

const KEYS = {
  session: 'oneplan.session.v1',
  access: 'oneplan.accessToken',
  refresh: 'oneplan.refreshToken',
  expiresAt: 'oneplan.expiresAt',
  appleUserId: 'oneplan.appleUserID',
} as const;

const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

let memory: Tokens | null = null;
let appleUserIdMemory: string | null = null;
let hydrated = false;
let fromNative = false;
let revision = 0;
let pending: Promise<unknown> = Promise.resolve();

export type SessionWriteResult =
  { status: 'committed'; revision: number } | { status: 'cancelled'; revision: number };

// Serialize hydration, refresh and logout: a slow migration must not resurrect a
// session after a newer sign-out. One secure JSON entry commits both tokens atomically.
function serialized<T>(action: () => Promise<T>): Promise<T> {
  const next = pending.then(action, action);
  pending = next.catch(() => undefined);
  return next;
}

interface SessionRecord {
  version: 1;
  tokens: Tokens | null;
  fromNative?: boolean;
}

async function persistSession(record: SessionRecord) {
  const value = JSON.stringify(record);
  await SecureStore.setItemAsync(KEYS.session, value, SECURE_OPTS);
  if ((await SecureStore.getItemAsync(KEYS.session, SECURE_OPTS)) !== value) {
    throw new Error('Unable to persist session');
  }
}

function validTokens(value: unknown): value is Tokens {
  if (!value || typeof value !== 'object') return false;
  const tokens = value as Partial<Tokens>;
  return (
    typeof tokens.accessToken === 'string' &&
    tokens.accessToken.length > 0 &&
    typeof tokens.refreshToken === 'string' &&
    tokens.refreshToken.length > 0 &&
    (tokens.expiresAt === undefined ||
      (typeof tokens.expiresAt === 'number' && Number.isFinite(tokens.expiresAt)))
  );
}
const listeners = new Set<(tokens: Tokens | null) => void>();

function notify() {
  for (const l of listeners) l(memory);
}

export const tokenStore = {
  /** Load from secure storage once at boot. Safe to call repeatedly. */
  hydrate(): Promise<Tokens | null> {
    const startedAt = revision;
    return serialized(async () => {
      if (hydrated) return memory;
      const saved = await SecureStore.getItemAsync(KEYS.session, SECURE_OPTS);
      appleUserIdMemory = await SecureStore.getItemAsync(KEYS.appleUserId, SECURE_OPTS);
      if (saved !== null) {
        // A tombstone or corrupt RN record must never fall back to older credentials.
        try {
          const record = JSON.parse(saved) as SessionRecord;
          memory = record.version === 1 && validTokens(record.tokens) ? record.tokens : null;
          fromNative = memory !== null && record.fromNative === true;
        } catch {
          memory = null;
        }
      } else {
        const [accessToken, refreshToken, expiry] = await Promise.all([
          SecureStore.getItemAsync(KEYS.access, SECURE_OPTS),
          SecureStore.getItemAsync(KEYS.refresh, SECURE_OPTS),
          SecureStore.getItemAsync(KEYS.expiresAt, SECURE_OPTS),
        ]);
        if (accessToken !== null || refreshToken !== null) {
          const expiresAt =
            expiry !== null && Number.isFinite(Number(expiry)) ? Number(expiry) : undefined;
          const existing = { accessToken, refreshToken, expiresAt };
          const tokens = validTokens(existing) ? existing : null;
          await persistSession({ version: 1, tokens });
          memory = tokens;
        } else {
          // A locked Keychain or unavailable Android key falls back to sign-in.
          // Leave migration retryable next launch; never log native error details.
          const legacy = await readLegacySession().catch(() => null);
          const appleUserId = legacy?.appleUserId;
          if (validTokens(legacy)) {
            const imported = { accessToken: legacy.accessToken, refreshToken: legacy.refreshToken };
            if (appleUserId) {
              await SecureStore.setItemAsync(KEYS.appleUserId, appleUserId, SECURE_OPTS);
              appleUserIdMemory = appleUserId;
            }
            await persistSession({ version: 1, tokens: imported, fromNative: true });
            memory = imported;
            fromNative = true;
          }
        }
      }
      if (startedAt !== revision) {
        memory = null;
        fromNative = false;
      }
      hydrated = true;
      return memory;
    });
  },

  wasImportedFromNative(): boolean {
    return fromNative;
  },

  get(): Tokens | null {
    return memory;
  },

  isHydrated(): boolean {
    return hydrated;
  },

  /** A caller can use this immediately before publishing auth state. */
  isCurrentRevision(candidate: number): boolean {
    return candidate === revision;
  },

  getRevision(): number {
    return revision;
  },

  /** `expiresIn` is the server's seconds-until-expiry (AuthResponseDto). */
  set(
    next: { accessToken: string; refreshToken: string; expiresIn?: number },
    now = Date.now(),
  ): Promise<SessionWriteResult> {
    const startedAt = ++revision;
    return serialized(async () => {
      const tokens = {
        accessToken: next.accessToken,
        refreshToken: next.refreshToken,
        expiresAt: typeof next.expiresIn === 'number' ? now + next.expiresIn * 1000 : undefined,
      };
      if (
        !tokens.accessToken ||
        typeof tokens.refreshToken !== 'string' ||
        (tokens.expiresAt !== undefined && !Number.isFinite(tokens.expiresAt))
      )
        throw new Error('Invalid session');
      await persistSession({ version: 1, tokens });
      if (startedAt !== revision) return { status: 'cancelled', revision: startedAt };
      memory = tokens;
      fromNative = false;
      hydrated = true;
      notify();
      return { status: 'committed', revision: startedAt };
    });
  },

  clear(): Promise<void> {
    ++revision;
    memory = null;
    fromNative = false;
    hydrated = true;
    notify();
    return serialized(async () => {
      // A durable tombstone prevents importing the old native session after logout,
      // even if cleaning up pre-Phase-9 RN keys is interrupted.
      await persistSession({ version: 1, tokens: null });
      await Promise.all([
        SecureStore.deleteItemAsync(KEYS.access, SECURE_OPTS),
        SecureStore.deleteItemAsync(KEYS.refresh, SECURE_OPTS),
        SecureStore.deleteItemAsync(KEYS.expiresAt, SECURE_OPTS),
      ]);
    });
  },

  getAppleUserId(): string | null {
    return appleUserIdMemory;
  },

  async setAppleUserId(id: string | null) {
    appleUserIdMemory = id;
    if (id) await SecureStore.setItemAsync(KEYS.appleUserId, id, SECURE_OPTS);
    else await SecureStore.deleteItemAsync(KEYS.appleUserId, SECURE_OPTS);
  },

  subscribe(listener: (tokens: Tokens | null) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Test-only. */
  _resetForTests() {
    // Invalidate any queued persistence operation without replacing the queue itself. Tests may
    // reset the in-memory mirror while a deliberately delayed SecureStore write is still pending.
    revision += 1;
    memory = null;
    appleUserIdMemory = null;
    hydrated = false;
    listeners.clear();
  },
};

/** True when the access token expires within `withinMs` (default 60 s). */
export function isAccessTokenExpiring(
  tokens: Tokens | null,
  withinMs = 60_000,
  now = Date.now(),
): boolean {
  if (!tokens?.expiresAt) return false;
  return tokens.expiresAt - now < withinMs;
}
