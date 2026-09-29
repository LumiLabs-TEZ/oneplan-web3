import type { LocalAuthenticationResult } from 'expo-local-authentication/build/LocalAuthentication.types';

import { confirmWithBiometrics } from './biometrics';

function withAuthenticate(result: LocalAuthenticationResult) {
  return { authenticateAsync: jest.fn(async () => result) };
}

describe('confirmWithBiometrics', () => {
  it('resolves "ok" on success', async () => {
    const deps = withAuthenticate({ success: true });
    await expect(confirmWithBiometrics('reason', deps)).resolves.toBe('ok');
    expect(deps.authenticateAsync).toHaveBeenCalledWith({
      promptMessage: 'reason',
      disableDeviceFallback: false,
      cancelLabel: undefined,
    });
  });

  it('passes cancelLabel through to authenticateAsync', async () => {
    const deps = withAuthenticate({ success: true });
    await confirmWithBiometrics('reason', { ...deps, cancelLabel: 'Cancel' });
    expect(deps.authenticateAsync).toHaveBeenCalledWith({
      promptMessage: 'reason',
      disableDeviceFallback: false,
      cancelLabel: 'Cancel',
    });
  });

  it.each(['not_available', 'not_enrolled', 'passcode_not_set'] as const)(
    'resolves "unavailable" for error %s',
    async (error) => {
      const deps = withAuthenticate({ success: false, error });
      await expect(confirmWithBiometrics('reason', deps)).resolves.toBe('unavailable');
    },
  );

  it.each(['user_cancel', 'system_cancel', 'app_cancel'] as const)(
    'resolves "cancelled" for error %s',
    async (error) => {
      const deps = withAuthenticate({ success: false, error });
      await expect(confirmWithBiometrics('reason', deps)).resolves.toBe('cancelled');
    },
  );

  it.each(['lockout', 'no_space', 'timeout', 'unable_to_process', 'unknown', 'user_fallback', 'invalid_context', 'authentication_failed'] as const)(
    'resolves "failed" for error %s',
    async (error) => {
      const deps = withAuthenticate({ success: false, error });
      await expect(confirmWithBiometrics('reason', deps)).resolves.toBe('failed');
    },
  );
});
