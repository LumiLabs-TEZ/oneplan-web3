import { createAppQueryClient, createPersister, mmkvQueryStorage } from '@/offline/persister';

const persister = createPersister();

/**
 * App-wide QueryClient singleton. Exposed as a module value (not only via the
 * React provider) so non-React code — sign-in/sign-out, the auth middleware,
 * push handlers — can invalidate or wipe the cache.
 */
export const queryClient = createAppQueryClient(persister);

/**
 * Drop expired / version-busted persisted entries. The persister only evicts an entry when that
 * exact query is read again, so slices of a formerly-ongoing trip or a previous app version
 * would otherwise sit in MMKV (mapped into memory at launch) forever. Run once after startup.
 */
export function gcPersistedQueries(): Promise<void> {
  return persister.persisterGc();
}

/**
 * Drop every cached query, in memory AND the MMKV-persisted copies.
 * `QueryClient.clear()` alone leaves the persisted rows behind, and the
 * persister would restore the previous user's data on the next fetch —
 * this is the privacy wipe that mirrors iOS clearing `OngoingTripCache` on logout.
 */
export function resetQueryCache(): void {
  queryClient.clear();
  // `entries` is synchronous for the MMKV adapter (typed MaybePromise by the persister API).
  const entries = mmkvQueryStorage.entries?.() as [string, string][] | undefined;
  for (const [key] of entries ?? []) mmkvQueryStorage.removeItem(key);
}
