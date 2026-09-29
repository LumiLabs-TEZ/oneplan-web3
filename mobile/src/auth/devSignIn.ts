import { registerWithEmail, signInWithEmail } from '@/auth/email';
import { isProd } from '@/lib/env';

/**
 * Simulator / local-server helper: email+password against `/auth/login`, registering the
 * fixed dev user on first use. Never available in prod (no social step to spoof).
 * The Maestro flows under `.maestro/` are signed in as this account.
 */
const DEV_EMAIL = 'spike@oneplan.local';
const DEV_PASSWORD = 'SpikePass123!';

export async function signInDevUser(): Promise<void> {
  if (isProd) throw new Error('email sign-in is dev/local only');
  await signInWithEmail(DEV_EMAIL, DEV_PASSWORD).catch(() =>
    registerWithEmail(DEV_EMAIL, DEV_PASSWORD, 'Spike Tester'),
  );
}
