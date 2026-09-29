/**
 * Biometric (or device-passcode) confirmation gate, used before destructive actions like account
 * deletion — port of `AuthService.swift:256` (`deleteAccount`'s LAContext step). `authenticateAsync`
 * is called unconditionally (mirrors iOS `.deviceOwnerAuthentication`, which falls back to the
 * device passcode when no biometrics are enrolled) — `hasHardwareAsync`/`isEnrolledAsync` are not
 * used to gate the call, only the *error* the native call itself returns decides the outcome.
 *
 * node_modules/expo-local-authentication/build/LocalAuthentication.d.ts (`authenticateAsync`) +
 * LocalAuthentication.types.d.ts (`LocalAuthenticationResult`, `LocalAuthenticationError`).
 */
import * as LocalAuthentication from 'expo-local-authentication';

export type BiometricOutcome = 'ok' | 'cancelled' | 'unavailable' | 'failed';

export interface BiometricsDeps {
  authenticateAsync?: typeof LocalAuthentication.authenticateAsync;
  /** Label for the system prompt's cancel button — caller passes `t('Cancel')`. */
  cancelLabel?: string;
}

const UNAVAILABLE_ERRORS = new Set(['not_available', 'not_enrolled', 'passcode_not_set']);
const CANCELLED_ERRORS = new Set(['user_cancel', 'system_cancel', 'app_cancel']);

export async function confirmWithBiometrics(
  reason: string,
  deps: BiometricsDeps = {},
): Promise<BiometricOutcome> {
  const authenticateAsync = deps.authenticateAsync ?? LocalAuthentication.authenticateAsync;

  const result = await authenticateAsync({
    promptMessage: reason,
    disableDeviceFallback: false,
    cancelLabel: deps.cancelLabel,
  });

  if (result.success) return 'ok';
  if (UNAVAILABLE_ERRORS.has(result.error)) return 'unavailable';
  if (CANCELLED_ERRORS.has(result.error)) return 'cancelled';
  return 'failed';
}
