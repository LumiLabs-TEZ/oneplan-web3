import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import type { AuthResponseDto } from './session';
import { exchangeSocial, type SocialLoginBody } from './social';
import { tokenStore } from './tokenStore';

type AppleCredentialFields = Pick<
  AppleAuthentication.AppleAuthenticationCredential,
  'identityToken' | 'email' | 'fullName'
>;

/**
 * Builds the `/auth/social` body from an Apple credential. Apple only returns
 * `fullName`/`email` on the FIRST authorization, so both are optional; the
 * server keeps whatever it already has for returning users. `rawNonce` is the
 * un-hashed value — the server hashes it and compares with the token's `nonce`.
 */
export function buildSocialLoginBody(
  credential: AppleCredentialFields,
  rawNonce: string,
): SocialLoginBody {
  if (!credential.identityToken) throw new Error('Apple returned no identityToken');
  const displayName = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(' ');
  return {
    identityToken: credential.identityToken,
    provider: 'APPLE',
    nonce: rawNonce,
    ...(credential.email ? { email: credential.email } : {}),
    ...(displayName ? { displayName } : {}),
  };
}

/**
 * Sign in with Apple (port of `AuthService.swift` nonce flow): a random raw nonce
 * is SHA-256 hashed for the Apple request; the RAW nonce goes to the server.
 * The Apple user id is kept so `useAppleCredentialWatcher` can poll revocation.
 */
export async function signInWithApple(): Promise<AuthResponseDto> {
  if (Platform.OS !== 'ios') throw new Error('Apple sign-in is only available on iOS');
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });
  const body = buildSocialLoginBody(credential, rawNonce);
  await tokenStore.setAppleUserId(credential.user);
  return exchangeSocial(body);
}
