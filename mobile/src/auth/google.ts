import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

import { env } from '@/lib/env';

import type { AuthResponseDto } from './session';
import { exchangeSocial } from './social';

let googleConfigured = false;

/** Lazily configures the SDK once (port of `AuthService.configureGoogleSignIn`). */
function ensureGoogleConfigured(): void {
  if (googleConfigured) return;
  GoogleSignin.configure(
    // iOS uses only the iOS client id (mirrors AuthService.swift, which never sets
    // serverClientID). Passing webClientId too makes GIDConfiguration request a token
    // with the web client as audience, which Google rejects with `invalid_audience`
    // unless both ids live in the same GCP project. Android needs webClientId to mint
    // the server-audience idToken.
    Platform.OS === 'ios'
      ? { iosClientId: env.google.iosClientId }
      : { webClientId: env.google.webClientId },
  );
  googleConfigured = true;
}

/** Thrown when the user dismisses the Google account chooser. */
export class GoogleSignInCancelledError extends Error {
  constructor() {
    super('Google sign-in cancelled');
    this.name = 'GoogleSignInCancelledError';
  }
}

export async function signInWithGoogle(): Promise<AuthResponseDto> {
  ensureGoogleConfigured();
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) throw new GoogleSignInCancelledError();
  const idToken = response.data.idToken;
  if (!idToken) throw new Error('Google returned no idToken');
  return exchangeSocial({
    identityToken: idToken,
    provider: 'GOOGLE',
    email: response.data.user.email,
    displayName: response.data.user.name ?? undefined,
  });
}
