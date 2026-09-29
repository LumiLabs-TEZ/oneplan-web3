/**
 * Pure port of `Analytics/SessionTracker.swift`.
 *
 * A session id is generated on cold start or when the app has been in the
 * background for longer than {@link INACTIVITY_TIMEOUT_MS}. The last state is
 * persisted (MMKV) so force-quits roll over correctly. `registeredSessionId`
 * is the id whose `POST /analytics/sessions` the server confirmed; comparing
 * it against `sessionId` makes a rotated session unregistered for free.
 *
 * Nothing here touches the network or the clock — callers inject `now` and
 * `uuid`, and persist via {@link loadPersisted} / {@link savePersisted}.
 */

export const INACTIVITY_TIMEOUT_MS = 30 * 60_000;

export interface PersistedSession {
  sessionId: string | null;
  /** ISO8601 timestamp of when `sessionId` started. */
  sessionStartedAt: string | null;
  /** Epoch ms of the most recent background transition, cleared on rotation. */
  lastBackgroundedAt: number | null;
  /** Session id the server has confirmed via `POST /analytics/sessions`. */
  registeredSessionId: string | null;
}

export interface ResolvedSession {
  id: string;
  /** ISO8601 */
  startedAt: string;
  /** A brand-new session was created — emit `APP_OPEN`. */
  isNew: boolean;
  /** The server has not confirmed this id yet — (re)attempt registration. */
  needsRegistration: boolean;
  next: PersistedSession;
}

export const EMPTY_SESSION: PersistedSession = {
  sessionId: null,
  sessionStartedAt: null,
  lastBackgroundedAt: null,
  registeredSessionId: null,
};

export function resolveForegroundSession(
  persisted: PersistedSession,
  now: number,
  uuid: () => string,
): ResolvedSession {
  const { sessionId, sessionStartedAt, lastBackgroundedAt, registeredSessionId } = persisted;

  const isExpired =
    lastBackgroundedAt === null
      ? sessionId === null
      : now - lastBackgroundedAt >= INACTIVITY_TIMEOUT_MS;

  if (sessionId !== null && sessionStartedAt !== null && !isExpired) {
    return {
      id: sessionId,
      startedAt: sessionStartedAt,
      isNew: false,
      needsRegistration: registeredSessionId !== sessionId,
      next: persisted,
    };
  }

  const id = uuid();
  const startedAt = new Date(now).toISOString();
  return {
    id,
    startedAt,
    isNew: true,
    needsRegistration: true,
    next: {
      sessionId: id,
      sessionStartedAt: startedAt,
      lastBackgroundedAt: null,
      registeredSessionId,
    },
  };
}

export function markBackground(persisted: PersistedSession, now: number): PersistedSession {
  return { ...persisted, lastBackgroundedAt: now };
}

/** Ignored if the session has since rotated, so a stale id is never marked registered. */
export function markRegistered(persisted: PersistedSession, id: string): PersistedSession {
  if (persisted.sessionId !== id) return persisted;
  return { ...persisted, registeredSessionId: id };
}

export function isRegistered(persisted: PersistedSession): boolean {
  return persisted.sessionId !== null && persisted.sessionId === persisted.registeredSessionId;
}

// --- Persistence -------------------------------------------------------------

export const SESSION_KEYS = {
  sessionId: 'analytics.sessionId',
  sessionStartedAt: 'analytics.sessionStartedAt',
  lastBackgroundedAt: 'analytics.lastBackgroundedAt',
  registeredSessionId: 'analytics.registeredSessionId',
} as const;

/** The subset of `MMKV` the tracker needs (keeps tests free of native modules). */
export interface SessionStorage {
  getString(key: string): string | undefined;
  getNumber(key: string): number | undefined;
  set(key: string, value: string | number): void;
  remove(key: string): void;
}

export function loadPersisted(storage: SessionStorage): PersistedSession {
  return {
    sessionId: storage.getString(SESSION_KEYS.sessionId) ?? null,
    sessionStartedAt: storage.getString(SESSION_KEYS.sessionStartedAt) ?? null,
    lastBackgroundedAt: storage.getNumber(SESSION_KEYS.lastBackgroundedAt) ?? null,
    registeredSessionId: storage.getString(SESSION_KEYS.registeredSessionId) ?? null,
  };
}

export function savePersisted(storage: SessionStorage, p: PersistedSession): void {
  const write = (key: string, value: string | number | null) => {
    if (value === null) storage.remove(key);
    else storage.set(key, value);
  };
  write(SESSION_KEYS.sessionId, p.sessionId);
  write(SESSION_KEYS.sessionStartedAt, p.sessionStartedAt);
  write(SESSION_KEYS.lastBackgroundedAt, p.lastBackgroundedAt);
  write(SESSION_KEYS.registeredSessionId, p.registeredSessionId);
}
