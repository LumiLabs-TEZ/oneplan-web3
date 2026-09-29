import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { useAuthStore } from './authStore';
import { signOutEverywhere } from './session';
import { tokenStore } from './tokenStore';

const { AppleAuthenticationCredentialState: State } = AppleAuthentication;

/**
 * `REVOKED`: the user removed OnePlan from their Apple ID → sign out.
 * `NOT_FOUND`: Apple no longer knows this user id → sign out.
 * `AUTHORIZED` / `TRANSFERRED`: keep the session.
 */
export function shouldSignOutForCredentialState(
  state: AppleAuthentication.AppleAuthenticationCredentialState,
): boolean {
  return state === State.REVOKED || state === State.NOT_FOUND;
}

async function checkAppleCredential(): Promise<void> {
  if (useAuthStore.getState().status !== 'authed') return;
  const appleUserId = tokenStore.getAppleUserId();
  if (!appleUserId) return;
  try {
    const state = await AppleAuthentication.getCredentialStateAsync(appleUserId);
    if (shouldSignOutForCredentialState(state)) await signOutEverywhere();
  } catch {
    // Network error — allow offline access (AuthService.checkAppleCredentialState).
  }
}

/**
 * Port of `AuthService.swift` Apple revocation handling: subscribes to the
 * system revoke notification and re-checks the credential state every time the
 * app returns to the foreground. iOS only; a no-op elsewhere.
 */
export function useAppleCredentialWatcher(): void {
  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const revokeSub = AppleAuthentication.addRevokeListener(() => {
      if (useAuthStore.getState().status === 'authed') void signOutEverywhere();
    });
    const appStateSub = AppState.addEventListener('change', (status) => {
      if (status === 'active') void checkAppleCredential();
    });
    void checkAppleCredential();

    return () => {
      revokeSub.remove();
      appStateSub.remove();
    };
  }, []);
}
