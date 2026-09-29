/**
 * Whether this build carries real Privy ids. Static (read from `env` once at boot), so unlike
 * `isVaultWalletConfigured()` (which reads the handle `PrivyVaultProvider` publishes from an
 * effect) it is safe to call during render and from the root-modal presenter, before any handle
 * exists.
 */
import { env } from '@/lib/env';

export function hasPrivyIds(): boolean {
  return env.privyAppId !== null && env.privyClientId !== null;
}
