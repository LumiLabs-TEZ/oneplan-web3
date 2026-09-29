import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { api as defaultApi, type ApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import { queryClient, resetQueryCache } from '@/api/queryClient';
import type { components } from '@/api/schema';

import { authStore, type SignOutReason } from './authStore';
import { runSignOutHooks } from './signOutHooks';
import { tokenStore } from './tokenStore';

export type AuthResponseDto = components['schemas']['AuthResponseDto'];

export interface SessionDeps {
  /** Injectable for tests; defaults to the app client. */
  api?: ApiClient;
}

/** A sign-in was superseded by logout or by a newer session write. */
export class SignInSessionCancelledError extends Error {
  constructor() {
    super('Sign-in cancelled');
    this.name = 'SignInSessionCancelledError';
  }
}

/**
 * Store the tokens from any `/auth/*` response and flip the app into the
 * authenticated state only after secure persistence succeeds. Callers await this
 * operation so a failed storage write stays in their existing sign-in error flow.
 */
export async function completeSignIn(res: AuthResponseDto): Promise<void> {
  const write = await tokenStore.set({
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    expiresIn: res.expiresIn,
  });
  // Keep this check adjacent to the state publication: a logout may have superseded the durable
  // write while it was in flight, and a cancelled sign-in must follow the existing silent-cancel
  // handling in the login screen.
  if (write.status !== 'committed' || !tokenStore.isCurrentRevision(write.revision)) {
    throw new SignInSessionCancelledError();
  }
  authStore.markAuthed();
  void queryClient.invalidateQueries({ queryKey: keys.me });
  void queryClient.invalidateQueries({ queryKey: keys.subscription.status });
}

/**
 * Used by the user sign-out path (after the remote steps) and by the API
 * middleware when the refresh token is rejected. Wipes the persisted query
 * cache for privacy (iOS clears `OngoingTripCache`).
 * When called for the `expired` reason directly (i.e. not via
 * `signOutEverywhere`, which already ran the hooks in step 1), also runs the
 * sign-out hooks best-effort — iOS's expired path used to skip them. Hooks
 * run `allSettled` and are never awaited past that: the push hook may
 * attempt `DELETE /devices/token` with the soon-to-be-invalid access token,
 * and failures are silently ignored. No other network call is made here.
 */
export function clearLocalSession(reason: SignOutReason = 'expired'): void {
  if (reason === 'expired') {
    void runSignOutHooks().catch(() => undefined);
  }
  resetQueryCache();
  authStore.signOut(reason);
}

/**
 * User-initiated sign-out (port of `AuthService.signOutRemotely` + `signOut`):
 *  1. run registered hooks (push token unregistration) — best-effort
 *  2. `POST /auth/logout { refreshToken }` to revoke the token family — best-effort
 *  3. wipe the query cache, 4. drop tokens → status `anon`.
 * Steps 3-4 always run, even when 1-2 fail (offline, 5xx).
 */
export async function signOutEverywhere(deps: SessionDeps = {}): Promise<void> {
  const api = deps.api ?? defaultApi;

  try {
    await runSignOutHooks();
  } catch {
    /* best-effort */
  }

  const refreshToken = tokenStore.get()?.refreshToken;
  if (refreshToken) {
    try {
      await api.POST('/auth/logout', { body: { refreshToken } });
    } catch {
      /* sign out locally even if the remote revoke fails */
    }
  }

  // Mirrors `GIDSignIn.sharedInstance.signOut()` so the next Google sign-in shows the chooser.
  try {
    await GoogleSignin.signOut();
  } catch {
    /* not configured / not signed in with Google */
  }

  clearLocalSession('user');
}
