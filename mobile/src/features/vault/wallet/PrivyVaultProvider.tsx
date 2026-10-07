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
import { useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { PrivyProvider } from '@privy-io/expo';

import { useAuthStore } from '@/auth/authStore';
import { env } from '@/lib/env';

import { useWeb3Enabled } from '../web3Flag';
import { useVaultWallet } from './useVaultWallet';
import { hasPrivyIds } from './walletConfig';
import { setWalletHandle, type WalletHandle } from './walletHandle';
import { fetchWalletTokenWithRetry } from './walletToken';

/** How long `isLoading` is held true when re-triggering Privy's custom-auth login. */
const RESYNC_PULSE_MS = 250;

async function getWalletToken(): Promise<string | undefined> {
  try {
    return await fetchWalletTokenWithRetry();
  } catch {
    // Best-effort, same as `WalletService.swift`'s bootstrap: a Privy/token-exchange outage must
    // never block sign-in or crash the SDK's token getter. Returning nothing makes Privy log its
    // session out, so `useVaultWallet` notices the `disconnected` wallet and asks for a resync
    // (`requestResync` below), reporting `sessionFailed` with `lastWalletTokenFailure()` if that
    // fails too.
    return undefined;
  }
}

/** Publishes the live wallet handle from inside the Privy tree; renders nothing itself. */
function WalletHandleBridge({
  isConfigured,
  requestResync,
}: {
  isConfigured: boolean;
  requestResync: () => void;
}) {
  const wallet = useVaultWallet(requestResync);

  useEffect(() => {
    const handle: WalletHandle = {
      kind: 'privy',
      isConfigured,
      isReady: wallet.isReady,
      connectedAddress: wallet.publicKey,
      ensureWallet: wallet.ensureWallet,
      connect: wallet.ensureWallet,
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
  // Pulsed true briefly to make Privy re-run its custom-auth login (see `isLoading`). Held for a
  // timer rather than a single render: Privy copies `config` into its own store from an effect,
  // and a same-commit true→false could be batched away before its login effect ever sees `true`.
  const [resyncing, setResyncing] = useState(false);
  const requestResync = useCallback(() => setResyncing(true), []);

  useEffect(() => {
    if (!resyncing) return;
    const timer = setTimeout(() => setResyncing(false), RESYNC_PULSE_MS);
    return () => clearTimeout(timer);
  }, [resyncing]);

  useEffect(() => {
    if (isConfigured) return;
    // No Privy SDK mounted at all in this state, so `WalletHandleBridge` never runs — publish
    // the "not configured" handle directly (every call throws `WalletError.notConfigured()`).
    setWalletHandle({
      kind: 'privy',
      isConfigured: false,
      isReady: false,
      connectedAddress: null,
      ensureWallet: () => Promise.reject(new Error('wallet not configured')),
      connect: () => Promise.reject(new Error('wallet not configured')),
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
              // exchange. `resyncing` pulses it true→false so Privy logs back in after its session
              // was dropped (it only retries when one of these inputs changes).
              isLoading: status !== 'authed' || resyncing,
              getCustomAccessToken: getWalletToken,
            },
          }}
        >
          <WalletHandleBridge isConfigured requestResync={requestResync} />
        </PrivyProvider>
      ) : null}
      {children}
    </>
  );
}
