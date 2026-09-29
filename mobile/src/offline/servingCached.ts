import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { classifyError } from '@/api/errors';

export interface CachedQueryLike {
  data: unknown;
  error: unknown;
}

/**
 * True when the UI is rendering cached data because the network is unreachable
 * (iOS `TripService.isServingCachedData`): data is present AND either the
 * device is offline or the last fetch failed with an offline error. Timeouts
 * deliberately do NOT count — like `NetworkMonitor.isOfflineError` excluding
 * `.timedOut`, a slow backend must not hide behind the "Offline" banner.
 */
export function isServingCached(q: CachedQueryLike, online: boolean): boolean {
  if (q.data === undefined) return false;
  if (!online) return true;
  return q.error != null && classifyError(q.error).kind === 'offline';
}

const subscribe = (onChange: () => void) => onlineManager.subscribe(onChange);
const getOnline = () => onlineManager.isOnline();

/** Reactive `onlineManager.isOnline()` (wired to NetInfo at app start). */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, getOnline, getOnline);
}

/** `isServingCached(q, useIsOnline())`. */
export function useServingCached(q: CachedQueryLike): boolean {
  return isServingCached(q, useIsOnline());
}
