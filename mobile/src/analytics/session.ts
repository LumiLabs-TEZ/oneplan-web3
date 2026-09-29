import * as Crypto from 'expo-crypto';

import { storage } from '@/offline/mmkv';

/**
 * Phase 0 stub of the analytics session layer. The full port (30-min sessions,
 * `POST /analytics/sessions`, `PATCH …/end` on background, batched events) is
 * Phase 1. For now only the stable anonymous id exists so the headers module
 * can emit `X-Anonymous-Id` from day one.
 */
const ANON_KEY = 'oneplan.anonymousId';

let sessionId: string | null = null;

export function anonymousId(): string {
  let id = storage.getString(ANON_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    storage.set(ANON_KEY, id);
  }
  return id;
}

export function currentSessionId(): string | null {
  return sessionId;
}

/** Set by the (Phase 1) analytics client when a session starts/ends. */
export function setCurrentSessionId(id: string | null): void {
  sessionId = id;
}
