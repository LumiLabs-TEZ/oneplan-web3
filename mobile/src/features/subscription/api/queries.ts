/**
 * `GET /subscription/status` — the server-authoritative subscription tier. Persisted to MMKV
 * (`meta.persist`) so a cached Pro state survives offline / the iOS silent-refresh window; disabled
 * until the auth store reports `authed`. `staleTime: 60s` + `refetchOnWindowFocus` keep it fresh
 * after a purchase completes in the background (App Store Server Notifications land server-side,
 * not pushed to the client) without hammering the endpoint on every mount.
 */
import { useQuery } from '@tanstack/react-query';

import { api as defaultApi, type ApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import { useAuthStore } from '@/auth/authStore';
import { persistOptions } from '@/offline/persister';

import { currentTier, isProTier } from '../entitlement';
import type { SubscriptionStatusDto, SubscriptionTier } from '../types';

export async function fetchSubscriptionStatus(
  api: ApiClient = defaultApi,
): Promise<SubscriptionStatusDto> {
  const { data, error, response } = await api.GET('/subscription/status');
  if (!data) {
    throw new Error(`GET /subscription/status ${response.status}: ${JSON.stringify(error)}`);
  }
  return data;
}

export function useSubscriptionStatus(transport: ApiClient = defaultApi) {
  const authed = useAuthStore((s) => s.status === 'authed');
  return useQuery({
    queryKey: keys.subscription.status,
    queryFn: () => fetchSubscriptionStatus(transport),
    ...persistOptions(true),
    enabled: authed,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** `false` while loading/unauthenticated — Pro gates fail closed. Server-authoritative `tier`. */
export function useIsPro(transport: ApiClient = defaultApi): boolean {
  return isProTier(useSubscriptionStatus(transport).data);
}

/** `'free'` while loading/unauthenticated. */
export function useCurrentTier(): SubscriptionTier {
  return currentTier(useSubscriptionStatus().data);
}
