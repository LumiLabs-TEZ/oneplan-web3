/**
 * Account deletion — port of `AuthService.swift:294-306` (the post-biometric-confirmation half of
 * `deleteAccount()`): `DELETE /auth/account`, then clear the session. Callers gate this behind
 * `confirmWithBiometrics` (`src/native/biometrics.ts`); this module does not touch biometrics.
 */
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { ApiMutationError } from '@/api/mutationError';

import { clearLocalSession } from './session';

export interface DeleteAccountDeps {
  api?: ApiClient;
}

/**
 * `DELETE /auth/account` — on failure throws `ApiMutationError` and leaves the session untouched.
 * On success, mirrors `signOutEverywhere`'s best-effort Google sign-out then wipes the local
 * session (query cache + tokens), same as iOS `signOut()` after a successful delete.
 */
export async function deleteAccount(deps: DeleteAccountDeps = {}): Promise<void> {
  const api = deps.api ?? defaultApi;

  const { error, response } = await api.DELETE('/auth/account');
  if (error || !response.ok) throw new ApiMutationError(response.status, error);

  try {
    await GoogleSignin.signOut();
  } catch {
    /* not configured / not signed in with Google */
  }

  clearLocalSession('user');
}
