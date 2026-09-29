import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { api, type ApiClient } from '@/api/client';
import type { components } from '@/api/schema';
import { type AuthStatus, useAuthStore } from '@/auth/authStore';
import { storage } from '@/offline/mmkv';

import { type ClientEventName, isClientEvent } from './events';
import { anonymousId, setCurrentSessionId } from './session';
import {
  isRegistered,
  loadPersisted,
  markBackground,
  markRegistered,
  type PersistedSession,
  resolveForegroundSession,
  savePersisted,
  type SessionStorage,
} from './sessionTracker';
import { setTracker } from './track';

type TrackEventDto = components['schemas']['TrackEventDto'];
type StartSessionDto = components['schemas']['StartSessionDto'];

export const MAX_BATCH = 50;
export const MAX_QUEUE = 500;

export interface PendingEvent {
  eventName: ClientEventName;
  /** ISO8601 */
  occurredAt: string;
  properties?: Record<string, JsonPrimitive>;
}

type JsonPrimitive = string | number | boolean | null;

export interface AnalyticsClientDeps {
  api: ApiClient;
  storage: SessionStorage;
  /** Epoch ms. */
  now: () => number;
  uuid: () => string;
  platform: 'ios' | 'android';
  appVersion?: string;
  osVersion?: string;
  /** Defaults to the auth store; the events/sessions endpoints are bearer-only. */
  isAuthed?: () => boolean;
}

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function warnDev(message: string): void {
  if (__DEV__) console.warn(`AnalyticsClient: ${message}`);
}

/**
 * Port of `Analytics/AnalyticsClient.swift`. Owns the session lifecycle and a
 * bounded in-memory queue of client-emitted events flushed in batches of
 * {@link MAX_BATCH}. Failures never propagate — analytics must never break a
 * user flow; a failed batch stays queued and is retried on the next flush.
 *
 * Differences from iOS, on purpose: `onBackground` actually runs (iOS never
 * wired `appDidEnterBackground`), and `x-session-id` is only attached to
 * requests after the server confirmed the session (`setCurrentSessionId`).
 */
export class AnalyticsClient {
  private readonly deps: AnalyticsClientDeps;
  private persisted: PersistedSession;
  private queue: PendingEvent[] = [];
  private flushing: Promise<void> | null = null;
  private registering: Promise<void> | null = null;

  constructor(deps: AnalyticsClientDeps) {
    this.deps = deps;
    this.persisted = loadPersisted(deps.storage);
  }

  /** Current (possibly unregistered) session id. */
  get sessionId(): string | null {
    return this.persisted.sessionId;
  }

  /** Read-only view of the queue, for tests and debugging. */
  get pending(): readonly PendingEvent[] {
    return this.queue;
  }

  /** Resolves once no flush or registration is in flight. */
  async whenIdle(): Promise<void> {
    // Let a flush scheduled by track()'s microtask start before we look.
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    while (this.flushing || this.registering) {
      await Promise.all([this.flushing, this.registering]);
      await new Promise<void>((resolve) => queueMicrotask(resolve));
    }
  }

  // --- Tracking ---------------------------------------------------------------

  track(eventName: string, properties?: Record<string, unknown>): void {
    if (!isClientEvent(eventName)) {
      warnDev(`dropping non-client event ${eventName}`);
      return;
    }
    const event: PendingEvent = {
      eventName,
      occurredAt: new Date(this.deps.now()).toISOString(),
    };
    const sanitized = this.sanitizeProperties(eventName, properties);
    if (sanitized) event.properties = sanitized;

    if (this.queue.length >= MAX_QUEUE) this.queue.shift();
    this.queue.push(event);
    // Microtask so synchronous bursts of track() calls batch into one request.
    queueMicrotask(() => void this.flush());
  }

  private sanitizeProperties(
    eventName: string,
    properties?: Record<string, unknown>,
  ): Record<string, JsonPrimitive> | undefined {
    if (!properties) return undefined;
    const out: Record<string, JsonPrimitive> = {};
    let count = 0;
    for (const [key, value] of Object.entries(properties)) {
      if (value === undefined) continue;
      if (!isJsonPrimitive(value)) {
        warnDev(`dropping non-primitive property "${key}" on ${eventName}`);
        continue;
      }
      out[key] = value;
      count += 1;
    }
    return count > 0 ? out : undefined;
  }

  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    if (this.queue.length === 0) return Promise.resolve();
    if (!this.canSend()) return Promise.resolve();
    this.flushing = this.flushLoop().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private canSend(): boolean {
    return isRegistered(this.persisted) && this.isAuthed();
  }

  private isAuthed(): boolean {
    return this.deps.isAuthed ? this.deps.isAuthed() : useAuthStore.getState().status === 'authed';
  }

  private async flushLoop(): Promise<void> {
    while (this.queue.length > 0 && this.canSend()) {
      const batch = this.queue.slice(0, MAX_BATCH);
      const events: TrackEventDto[] = batch.map((e) => ({
        eventName: e.eventName,
        occurredAt: e.occurredAt,
        ...(e.properties ? { properties: e.properties } : {}),
      }));
      let ok = false;
      try {
        const { response } = await this.deps.api.POST('/analytics/events', { body: { events } });
        ok = response.ok;
      } catch {
        ok = false;
      }
      if (!ok) return; // leave the batch queued; the next track() retries
      this.queue.splice(0, batch.length);
    }
  }

  // --- Lifecycle --------------------------------------------------------------

  onForeground(): void {
    const resolved = resolveForegroundSession(this.persisted, this.deps.now(), this.deps.uuid);
    this.save(resolved.next);
    if (resolved.isNew) this.track('APP_OPEN');
    if (resolved.needsRegistration) {
      void this.ensureRegistered();
    } else {
      setCurrentSessionId(resolved.id);
      void this.flush();
    }
  }

  onBackground(): void {
    this.save(markBackground(this.persisted, this.deps.now()));
    const id = this.persisted.sessionId;
    if (id === null || !isRegistered(this.persisted) || !this.isAuthed()) return;
    void this.endSession(id);
  }

  onAuthChanged(status: AuthStatus): void {
    if (status === 'authed') {
      void this.ensureRegistered();
      return;
    }
    // Signing out: the next login re-registers the (possibly reused) session
    // under the new user; until then no request should carry the old id.
    setCurrentSessionId(null);
    this.save({ ...this.persisted, registeredSessionId: null });
  }

  // --- Network ----------------------------------------------------------------

  private ensureRegistered(): Promise<void> {
    if (this.registering) return this.registering;
    const id = this.persisted.sessionId;
    const startedAt = this.persisted.sessionStartedAt;
    if (id === null || startedAt === null || !this.isAuthed()) return Promise.resolve();
    if (isRegistered(this.persisted)) {
      setCurrentSessionId(id);
      return this.flush();
    }
    this.registering = this.registerSession(id, startedAt).finally(() => {
      this.registering = null;
    });
    return this.registering;
  }

  private async registerSession(id: string, startedAt: string): Promise<void> {
    const body: StartSessionDto = {
      id,
      platform: this.deps.platform,
      anonymousId: anonymousId(),
      startedAt,
      ...(this.deps.appVersion ? { appVersion: this.deps.appVersion } : {}),
      ...(this.deps.osVersion ? { osVersion: this.deps.osVersion } : {}),
    };
    let ok = false;
    try {
      const { response } = await this.deps.api.POST('/analytics/sessions', { body });
      ok = response.ok;
    } catch {
      ok = false;
    }
    // Not marking the session registered on failure (commonly a pre-auth 401)
    // lets the next foreground / login retry instead of orphaning the id.
    if (!ok) return;
    this.save(markRegistered(this.persisted, id));
    if (this.persisted.sessionId === id) {
      setCurrentSessionId(id);
      void this.flush();
    }
  }

  private async endSession(id: string): Promise<void> {
    try {
      await this.deps.api.PATCH('/analytics/sessions/{id}/end', {
        params: { path: { id } },
        body: { endedAt: new Date(this.deps.now()).toISOString() },
      });
    } catch {
      // best-effort
    }
  }

  private save(next: PersistedSession): void {
    this.persisted = next;
    savePersisted(this.deps.storage, next);
  }
}

// --- Singleton ------------------------------------------------------------------

let singleton: AnalyticsClient | null = null;

/** App-wide client wired to real deps; plugs itself into the `track()` shim on first call. */
export function getAnalyticsClient(): AnalyticsClient {
  if (singleton) return singleton;
  const client = new AnalyticsClient({
    api,
    storage,
    now: Date.now,
    uuid: () => Crypto.randomUUID(),
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    appVersion: Application.nativeApplicationVersion ?? undefined,
    osVersion: Device.osVersion ?? undefined,
  });
  setTracker((name, properties) => client.track(name, properties));
  singleton = client;
  return client;
}
