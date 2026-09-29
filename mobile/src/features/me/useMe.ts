import { useQuery } from '@tanstack/react-query';

import { api as defaultApi, type ApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import type { components } from '@/api/schema';
import { useAuthStore } from '@/auth/authStore';
import { persistOptions } from '@/offline/persister';

export type UserProfileDto = components['schemas']['UserProfileDto'];

export async function fetchMe(api: ApiClient = defaultApi): Promise<UserProfileDto> {
  const { data, error, response } = await api.GET('/auth/me');
  if (!data) throw new Error(`GET /auth/me ${response.status}: ${JSON.stringify(error)}`);
  return data;
}

/**
 * The signed-in user's profile (`GET /auth/me`). Persisted to MMKV so the profile
 * renders offline — replaces iOS `UserProfileService`'s `oneplan.cachedUserProfile`.
 * Disabled until the auth store reports `authed`; `signOut` wipes the cache.
 */
export function useMe() {
  const authed = useAuthStore((s) => s.status === 'authed');
  return useQuery({
    queryKey: keys.me,
    queryFn: () => fetchMe(),
    ...persistOptions(true),
    enabled: authed,
  });
}

/**
 * Re-exported so existing `@/features/me/useMe` import sites keep compiling. The Pro gate now
 * reads the server-authoritative `/subscription/status` `tier` (`useSubscriptionStatus`,
 * `src/features/subscription/api/queries.ts`), never `UserProfileDto.isPro`.
 */
export { useIsPro } from '@/features/subscription/api/queries';
