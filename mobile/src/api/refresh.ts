import { fetch as expoFetch } from 'expo/fetch';

import { authStore } from '@/auth/authStore';
import { runSignOutHooks } from '@/auth/signOutHooks';
import { tokenStore, type Tokens } from '@/auth/tokenStore';

import { resetQueryCache } from './queryClient';
import type { components } from './schema';

type AuthResponse = components['schemas']['AuthResponseDto'];

/**
 * Single-flight refresh (port of web/shared/src/api/client.ts `refreshOnce`).
 * Concurrent callers share one in-flight promise; it is reset only after the
 * attempt settles so a later 401 wave starts a fresh refresh.
 * Uses raw `fetch` so it never goes through the auth middleware.
 */
let refreshInFlight: Promise<Tokens | null> | null = null;

export function refreshOnce(
  baseUrl: string,
  fetchImpl: typeof fetch = expoFetch as unknown as typeof fetch,
): Promise<Tokens | null> {
  if (refreshInFlight) return refreshInFlight;

  const current = tokenStore.get();
  if (!current?.refreshToken) return Promise.resolve(null);
  const startedRevision = tokenStore.getRevision();

  refreshInFlight = (async () => {
    try {
      const response = await fetchImpl(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as Partial<AuthResponse>;
      if (typeof data.accessToken !== 'string' || typeof data.refreshToken !== 'string')
        return null;
      // Logout or another session write may have happened while the network request was in
      // flight. Do not turn that stale response into a new session.
      if (!tokenStore.isCurrentRevision(startedRevision)) return null;
      const write = await tokenStore.set({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresIn: typeof data.expiresIn === 'number' ? data.expiresIn : undefined,
      });
      // Do not return a refreshed bearer token after logout or a newer session write won the
      // revision race. The caller will then treat the request as unauthenticated.
      if (write.status !== 'committed' || !tokenStore.isCurrentRevision(write.revision))
        return null;
      const tokens = tokenStore.get();
      return tokenStore.isCurrentRevision(write.revision) ? tokens : null;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/**
 * Refresh failed for good: wipe the cache, drop tokens and bounce to login.
 * Same as `clearLocalSession('expired')` in `@/auth/session` — inlined here
 * because `session.ts` imports the client, which imports this module.
 * Also runs the registered sign-out hooks best-effort (`allSettled`, never
 * awaited past that — failures are swallowed and never block this function)
 * so realtime/invites/links/push state doesn't leak across sessions when a
 * refresh fails rather than a user-initiated sign-out. The push hook may
 * attempt `DELETE /devices/token` with the soon-to-be-invalid access token;
 * that failure is ignored. No other network call is made here.
 */
export function handleAuthExpired(): void {
  void runSignOutHooks().catch(() => undefined);
  resetQueryCache();
  authStore.signOut('expired');
}

/** Test-only. */
export function _resetRefreshForTests() {
  refreshInFlight = null;
}
