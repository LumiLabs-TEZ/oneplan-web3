import {
  EMPTY_SESSION,
  INACTIVITY_TIMEOUT_MS,
  isRegistered,
  loadPersisted,
  markBackground,
  markRegistered,
  type PersistedSession,
  resolveForegroundSession,
  savePersisted,
  SESSION_KEYS,
  type SessionStorage,
} from './sessionTracker';

const T0 = Date.UTC(2026, 8, 13, 10, 0, 0);
let n = 0;
const uuid = () => `uuid-${++n}`;

function fakeStorage(): SessionStorage & { map: Map<string, string | number> } {
  const map = new Map<string, string | number>();
  return {
    map,
    getString: (k) => (typeof map.get(k) === 'string' ? (map.get(k) as string) : undefined),
    getNumber: (k) => (typeof map.get(k) === 'number' ? (map.get(k) as number) : undefined),
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
}

beforeEach(() => {
  n = 0;
});

describe('resolveForegroundSession', () => {
  it('first launch creates a new session that needs registration', () => {
    const r = resolveForegroundSession(EMPTY_SESSION, T0, uuid);
    expect(r).toMatchObject({
      id: 'uuid-1',
      startedAt: new Date(T0).toISOString(),
      isNew: true,
      needsRegistration: true,
    });
    expect(r.next).toEqual({
      sessionId: 'uuid-1',
      sessionStartedAt: new Date(T0).toISOString(),
      lastBackgroundedAt: null,
      registeredSessionId: null,
    });
  });

  it('reuses the session when foregrounded under 30 minutes after backgrounding', () => {
    const first = resolveForegroundSession(EMPTY_SESSION, T0, uuid);
    const registered = markRegistered(first.next, first.id);
    const backgrounded = markBackground(registered, T0 + 60_000);
    const r = resolveForegroundSession(backgrounded, T0 + INACTIVITY_TIMEOUT_MS - 1, uuid);
    expect(r.id).toBe('uuid-1');
    expect(r.startedAt).toBe(first.startedAt);
    expect(r.isNew).toBe(false);
    expect(r.needsRegistration).toBe(false);
    expect(r.next).toBe(backgrounded);
  });

  it('rotates the session after 30 minutes in background', () => {
    const first = resolveForegroundSession(EMPTY_SESSION, T0, uuid);
    const registered = markRegistered(first.next, first.id);
    const backgrounded = markBackground(registered, T0);
    const r = resolveForegroundSession(backgrounded, T0 + INACTIVITY_TIMEOUT_MS, uuid);
    expect(r.id).toBe('uuid-2');
    expect(r.isNew).toBe(true);
    expect(r.needsRegistration).toBe(true);
    expect(r.next.lastBackgroundedAt).toBeNull();
    // stale registration is carried but no longer matches → unregistered
    expect(r.next.registeredSessionId).toBe('uuid-1');
    expect(isRegistered(r.next)).toBe(false);
  });

  it('reuses a session that was never backgrounded (warm re-foreground)', () => {
    const first = resolveForegroundSession(EMPTY_SESSION, T0, uuid);
    const r = resolveForegroundSession(first.next, T0 + 5_000, uuid);
    expect(r.id).toBe('uuid-1');
    expect(r.isNew).toBe(false);
  });

  it('keeps needsRegistration true until markRegistered confirms the id', () => {
    const first = resolveForegroundSession(EMPTY_SESSION, T0, uuid);
    const again = resolveForegroundSession(first.next, T0 + 1_000, uuid);
    expect(again.isNew).toBe(false);
    expect(again.needsRegistration).toBe(true);

    const confirmed = markRegistered(again.next, again.id);
    expect(isRegistered(confirmed)).toBe(true);
    expect(resolveForegroundSession(confirmed, T0 + 2_000, uuid).needsRegistration).toBe(false);
  });

  it('markRegistered ignores an id that has since rotated', () => {
    const first = resolveForegroundSession(EMPTY_SESSION, T0, uuid);
    const p = markRegistered(first.next, 'some-old-id');
    expect(p).toBe(first.next);
    expect(isRegistered(p)).toBe(false);
  });
});

describe('markBackground', () => {
  it('stamps lastBackgroundedAt and leaves the rest untouched', () => {
    const first = resolveForegroundSession(EMPTY_SESSION, T0, uuid);
    const p = markBackground(first.next, T0 + 123);
    expect(p.lastBackgroundedAt).toBe(T0 + 123);
    expect(p.sessionId).toBe(first.next.sessionId);
    expect(p.sessionStartedAt).toBe(first.next.sessionStartedAt);
  });
});

describe('persistence', () => {
  it('round-trips through the four MMKV keys', () => {
    const storage = fakeStorage();
    const p: PersistedSession = {
      sessionId: 'sid',
      sessionStartedAt: new Date(T0).toISOString(),
      lastBackgroundedAt: T0 + 1,
      registeredSessionId: 'sid',
    };
    savePersisted(storage, p);
    expect([...storage.map.keys()].sort()).toEqual(Object.values(SESSION_KEYS).sort());
    expect(loadPersisted(storage)).toEqual(p);

    savePersisted(storage, { ...p, lastBackgroundedAt: null, registeredSessionId: null });
    expect(storage.map.has(SESSION_KEYS.lastBackgroundedAt)).toBe(false);
    expect(loadPersisted(storage)).toEqual({
      ...p,
      lastBackgroundedAt: null,
      registeredSessionId: null,
    });
  });

  it('loads EMPTY_SESSION from empty storage', () => {
    expect(loadPersisted(fakeStorage())).toEqual(EMPTY_SESSION);
  });
});
