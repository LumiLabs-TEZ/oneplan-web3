/**
 * Port of `AuthService.swift`'s wallet bootstrap (`origin/feat/web3-version`): create/link the
 * embedded wallet fire-and-forget on sign-in (cold start already-authenticated, or a fresh
 * login), and reset it as part of sign-out. Mirrors `@/push/registration.ts`'s
 * `usePushRegistration` + `installPushSignOutHook` shape.
 */
import { useEffect } from 'react';

import { registerSignOutHook } from '@/auth/signOutHooks';
import { useAuthStore } from '@/auth/authStore';

import { linkWallet } from '../api/mutations';
import { ensureVaultWallet, isVaultWalletConfigured, resetVaultWallet } from './walletHandle';
import { withWalletTimeout } from './walletTimeout';

/** Creates the wallet if needed and registers it on the server. Best-effort, never throws. */
export async function ensureWalletLinked(): Promise<void> {
  if (!isVaultWalletConfigured()) return;
  try {
    const address = await ensureVaultWallet();
    // Bounded like `ensureVaultWallet`: the deposit sheet awaits this behind a spinner.
    await withWalletTimeout(linkWallet({ publicKey: address }));
  } catch {
    // Best-effort, same as `WalletService.swift`'s `AuthService` call site (`print` on failure,
    // never surfaces an error) — a Privy outage must never block sign-in.
  }
}

/** Re-links on every sign-in (cold start already-authed, or a fresh login). Call once, at root. */
export function useWalletAuthBootstrap(): void {
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (status !== 'authed') return;
    void ensureWalletLinked();
  }, [status]);
}

let signOutHookInstalled = false;

/** Clears wallet + Privy session state before the session is torn down. */
export function installVaultSignOutHook(): void {
  if (signOutHookInstalled) return;
  signOutHookInstalled = true;
  registerSignOutHook(async () => {
    await resetVaultWallet();
  });
}
