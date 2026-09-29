import {
  experimental_createQueryPersister,
  type AsyncStorage,
} from '@tanstack/query-persist-client-core';
import { QueryClient } from '@tanstack/react-query';
import * as Application from 'expo-application';

import { storage } from './mmkv';

const PERSIST_PREFIX = 'oneplan.query';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Synchronous MMKV exposed through the persister's storage interface. */
export const mmkvQueryStorage: AsyncStorage<string> = {
  getItem: (key) => storage.getString(key) ?? null,
  setItem: (key, value) => {
    storage.set(key, value);
  },
  removeItem: (key) => {
    storage.remove(key);
  },
  entries: () =>
    storage
      .getAllKeys()
      .filter((k) => k.startsWith(PERSIST_PREFIX))
      .map((k) => [k, storage.getString(k) ?? ''] as [string, string]),
};

/** Cache is disposable — a new app version invalidates it (OngoingTripCache schemaVersion). */
export function cacheBuster(): string {
  return Application.nativeApplicationVersion ?? 'dev';
}

export function createPersister(opts: { buster?: string; maxAge?: number } = {}) {
  return experimental_createQueryPersister({
    storage: mmkvQueryStorage,
    prefix: PERSIST_PREFIX,
    maxAge: opts.maxAge ?? MAX_AGE_MS,
    buster: opts.buster ?? cacheBuster(),
    // Opt-in per query via `meta: { persist: true }` — replaces OngoingTripCache's
    // explicit save* calls; everything else stays memory-only.
    filters: { predicate: (query) => query.meta?.persist === true },
  });
}

/**
 * Options for a query that opts into MMKV persistence. Persisted queries keep their in-memory
 * copy for the whole `maxAge`: the persister only restores inside a *running* fetch, and fetches
 * pause while offline, so a collected ongoing-trip slice could not come back until reconnect.
 */
export function persistOptions(persist: boolean): {
  meta: { persist: boolean };
  gcTime?: number;
} {
  return persist ? { meta: { persist }, gcTime: MAX_AGE_MS } : { meta: { persist } };
}

export function createAppQueryClient(persister = createPersister()): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        persister: persister.persisterFn,
        staleTime: 30_000,
        // Memory-only queries (searches, other trips, feeds, photo pages) are dropped 10 min
        // after their last observer unmounts; persisted ones opt back in via `persistOptions`.
        gcTime: 10 * 60_000,
        retry: 1,
      },
    },
  });
}

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { persist?: boolean };
  }
}
