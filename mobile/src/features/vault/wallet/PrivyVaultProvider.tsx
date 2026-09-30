/**
 * Production `@privy-io/expo` wiring, adapted from the spike
 * (`spike/privy-expo`, the Privy Expo spike notes (local audit pack, not in the repo)) into the real app shell.
 *
 * Mounted once at the app root (`src/app/_layout.tsx`), unconditionally — it decides for itself
 * whether to actually mount the Privy SDK. Skips it (renders `children` straight through) when
 * `useWeb3Enabled()` is off, or when `env.privyAppId`/`privyClientId` are unset (no real Privy
 * app provisioned yet — an operator decision, see the Privy Expo spike notes (local audit pack, not in the repo) "Custom-auth
 * config needed in the Privy dashboard"). Either way every wallet call fails fast with
 * `WalletError.notConfigured()` (mirrors `WalletService.swift`'s `privy = nil` branch) — no
 * placeholder ids, no SDK validation throw, no visual/behavioural change for a build that never
 * uses the vault (`prod` defaults `useWeb3Enabled()` off).
 *
 * The inner bridge component publishes `useVaultWallet()`'s handle into `walletHandle.ts` on
 * every render so non-component call sites (the signing pipeline, the auth bootstrap) can reach
 * it without needing to be inside this tree themselves.
 */
import { useEffect, type PropsWithChildren } from 'react';
import { PrivyProvider } from '@privy-io/expo';

import { useAuthStore } from '@/auth/authStore';
import { env } from '@/lib/env';

import { useWeb3Enabled } from '../web3Flag';
import { useVaultWallet } from './useVaultWallet';
import { hasPrivyIds } from './walletConfig';
import { setWalletHandle, type WalletHandle } from './walletHandle';
import { fetchWalletToken } from './walletToken';

async function getWalletToken(): Promise<string | undefined> {
  try {
    return await fetchWalletToken();
  } catch {
    // Best-effort, same as `WalletService.swift`'s bootstrap: a Privy/token-exchange outage must
    // never block sign-in or crash the SDK's token getter. The caller sees `sessionFailed`
    // instead, from `useVaultWallet`'s own error paths.
    return undefined;
  }
}

/** Publishes the live wallet handle from inside the Privy tree; renders nothing itself. */
function WalletHandleBridge({ isConfigured }: { isConfigured: boolean }) {
  const wallet = useVaultWallet();

  useEffect(() => {
    const handle: WalletHandle = {
      isConfigured,
      isReady: wallet.isReady,
      ensureWallet: wallet.ensureWallet,
      sign: wallet.sign,
      reset: wallet.reset,
    };
    setWalletHandle(handle);
  }, [isConfigured, wallet]);

  return null;
}

export function PrivyVaultProvider({ children }: PropsWithChildren) {
  const status = useAuthStore((s) => s.status);
  const web3Enabled = useWeb3Enabled();
  const isConfigured = web3Enabled && hasPrivyIds();

  useEffect(() => {
    if (isConfigured) return;
    // No Privy SDK mounted at all in this state, so `WalletHandleBridge` never runs — publish
    // the "not configured" handle directly (every call throws `WalletError.notConfigured()`).
    setWalletHandle({
      isConfigured: false,
      isReady: false,
      ensureWallet: () => Promise.reject(new Error('wallet not configured')),
      sign: () => Promise.reject(new Error('wallet not configured')),
      reset: () => Promise.resolve(),
    });
    return () => setWalletHandle(null);
  }, [isConfigured]);

  // `children` stays at a fixed slot: Privy is a SIBLING, not a wrapper. Wrapping children in
  // `<PrivyProvider>` only once `useWeb3Enabled()` flips true (after `GET /web3/eligibility`)
  // changed the element type above them and remounted the whole navigator. The bridge is the only
  // Privy consumer, so it doesn't need the app tree inside the provider.
  return (
    <>
      {isConfigured ? (
        <PrivyProvider
          appId={env.privyAppId as string}
          clientId={env.privyClientId as string}
          config={{
            customAuth: {
              enabled: true,
              // Privy re-invokes `getCustomAccessToken` itself whenever this flips or the token
              // needs refreshing — there is no imperative login call to make (unlike the iOS
              // SDK's `loginWithCustomAccessToken()`). Keep it loading until the app itself is
              // signed in, so Privy never calls the token endpoint while there is nothing to
              // exchange.
              isLoading: status !== 'authed',
              getCustomAccessToken: getWalletToken,
            },
          }}
        >
          <WalletHandleBridge isConfigured />
        </PrivyProvider>
      ) : null}
      {children}
    </>
  );
}
