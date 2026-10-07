/**
 * Port of `WalletService.swift`'s wallet-resolution + signing logic
 * (`origin/feat/web3-version`) onto `@privy-io/expo`'s hooks. See
 * the Privy Expo spike notes (local audit pack, not in the repo) "API mapping" for the full iOS↔Expo table.
 *
 * Must be called from inside `<PrivyVaultProvider>` (mounted once, app root,
 * `src/app/_layout.tsx`) — not a general-purpose hook for feature screens, which should go
 * through `@/features/vault/wallet/walletHandle` instead so wallet resolution only happens once.
 */
import { useCallback, useRef } from 'react';
import { usePrivy, useEmbeddedSolanaWallet } from '@privy-io/expo';
import { VersionedTransaction } from '@solana/web3.js';

import { describeUnknownError, WalletError } from './walletError';
import { lastWalletTokenFailure } from './walletToken';

/**
 * The one creation/link attempt in flight, shared by every caller that arrives while it runs.
 * Sign-in and the vault card can each ask for the wallet within the same tick, and two of them
 * each finding none created two wallets on iOS before this guard existed — port it exactly
 * (module-level, not per-render: `useCallback` alone would still let two renders race).
 */
let ensureWalletPromise: Promise<string> | null = null;

/** How long `ensureWallet` waits for Privy to finish initialising; under `WALLET_SETUP_TIMEOUT_MS`. */
const PRIVY_READY_WAIT_MS = 15_000;
const PRIVY_READY_POLL_MS = 200;
/** How long Privy may sit `disconnected` while ready before we re-trigger its login. */
const PRIVY_DISCONNECTED_GRACE_MS = 1_000;

interface PrivySnapshot {
  isReady: boolean;
  solanaWallet: ReturnType<typeof useEmbeddedSolanaWallet>;
  requestResync?: () => void;
}

/** Dev-only breadcrumb so a repro shows which Privy state a wallet failure came from. */
function failWith(error: WalletError, snapshot: PrivySnapshot): WalletError {
  if (__DEV__) {
    console.warn('[vault-wallet]', error.message, {
      isReady: snapshot.isReady,
      status: snapshot.solanaWallet.status,
      walletToken: lastWalletTokenFailure(),
    });
  }
  return error;
}

export interface UseVaultWalletResult {
  isReady: boolean;
  publicKey: string | null;
  ensureWallet: () => Promise<string>;
  sign: (base64Tx: string) => Promise<string>;
  reset: () => Promise<void>;
}

/**
 * @param requestResync Re-triggers Privy's custom-auth login (`PrivyVaultProvider`); called at
 *   most once per wallet resolution, when Privy has dropped its session.
 */
export function useVaultWallet(requestResync?: () => void): UseVaultWalletResult {
  const { user, isReady, logout } = usePrivy();
  const solanaWallet = useEmbeddedSolanaWallet();
  // Latest render's Privy state, so a wait started in an earlier render sees Privy settle.
  const latest = useRef<PrivySnapshot>({ isReady, solanaWallet, requestResync });
  latest.current = { isReady, solanaWallet, requestResync };

  const primaryWalletOf = useCallback((wallet: typeof solanaWallet) => {
    if (wallet.status !== 'connected') return null;
    // Lowest address wins, deterministically — see constants.ts / doc comment on WalletService.swift:
    // picking `first` from an unordered list let two devices link two different wallets to the
    // same account, and the server then rejected every transaction as unsigned.
    return wallet.wallets.reduce<(typeof wallet.wallets)[number] | null>(
      (lowest, candidate) =>
        lowest === null || candidate.address < lowest.address ? candidate : lowest,
      null,
    );
  }, []);
  const primaryWallet = useCallback(
    () => primaryWalletOf(solanaWallet),
    [primaryWalletOf, solanaWallet],
  );

  /**
   * Right after sign-in Privy is still initialising (`isReady` false, wallet list unresolved), so
   * the first setup attempt used to fail with `sessionNotReady` and only Retry worked. Wait for it
   * to settle instead — bounded, and a hard `error`/`needs-recovery` status returns immediately.
   *
   * A wallet stuck `disconnected` while Privy is ready means Privy has no user: its custom-auth
   * effect logged the session out (the wallet-token fetch failed) and won't retry on its own until
   * one of its inputs changes. Ask the provider to re-trigger that login once, then keep waiting.
   */
  const waitForPrivy = useCallback(async (stopOnNeedsRecovery = true): Promise<void> => {
    const deadline = Date.now() + PRIVY_READY_WAIT_MS;
    let disconnectedSince: number | null = null;
    let resyncRequested = false;
    for (;;) {
      const { isReady: ready, solanaWallet: current } = latest.current;
      const status = current.status;
      if (status === 'error') return;
      if (status === 'needs-recovery' && stopOnNeedsRecovery) return;
      if (ready && (status === 'connected' || status === 'not-created')) return;
      if (Date.now() >= deadline) return;
      if (ready && status === 'disconnected') {
        disconnectedSince ??= Date.now();
        if (!resyncRequested && Date.now() - disconnectedSince >= PRIVY_DISCONNECTED_GRACE_MS) {
          resyncRequested = true;
          latest.current.requestResync?.();
        }
      } else {
        disconnectedSince = null;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, PRIVY_READY_POLL_MS));
    }
  }, []);

  const resolveWallet = useCallback(async (): Promise<string> => {
    await waitForPrivy();
    // The render this closure captured predates the wait; re-read through the latest state.
    let current = latest.current.solanaWallet;

    if (current.status === 'needs-recovery') {
      // Privy lost the wallet's local key share (its WebView was reloaded / storage wiped).
      // Automatic (Privy-managed) recovery needs no user input; one attempt, then report it.
      try {
        await current.recover();
      } catch (error) {
        throw failWith(
          WalletError.sessionFailed(`needs-recovery: ${describeUnknownError(error)}`),
          latest.current,
        );
      }
      // `recover()` resolves before React re-renders with the new status — keep waiting past
      // the stale `needs-recovery` rather than reading it back as the answer.
      await waitForPrivy(false);
      current = latest.current.solanaWallet;
    }

    const existing = primaryWalletOf(current);
    if (existing) return existing.address;

    if (current.status === 'error') {
      throw failWith(WalletError.sessionFailed(current.error), latest.current);
    }
    if (current.status === 'disconnected') {
      // Still no Privy session after the resync — almost always the wallet-token exchange.
      throw failWith(
        WalletError.sessionFailed(lastWalletTokenFailure() ?? 'disconnected'),
        latest.current,
      );
    }
    if (current.status !== 'not-created') {
      // Privy is still resolving the wallet list — ask again shortly rather than calling
      // `create()` in a status it does not accept from.
      throw failWith(new WalletError('sessionNotReady', current.status), latest.current);
    }

    let provider: Awaited<ReturnType<typeof current.create>>;
    try {
      provider = await current.create();
    } catch (error) {
      throw WalletError.creationFailed(describeUnknownError(error));
    }
    if (!provider) {
      // Documented Android caveat (Google Drive recovery can return null on success) —
      // the Privy Expo spike notes (local audit pack, not in the repo) "API mapping".
      throw WalletError.creationFailed('wallet creation returned no provider');
    }

    // `_publicKey` is deprecated in favour of `wallets[].address`, but it exists exactly for this
    // moment: `solanaWallet.wallets` reflects this hook's *own render*, not this `await` — reading
    // through `primaryWallet()` again here would race a re-render that may not have happened yet.
    return provider._publicKey;
  }, [primaryWalletOf, waitForPrivy]);

  const ensureWallet = useCallback((): Promise<string> => {
    if (ensureWalletPromise) return ensureWalletPromise;
    const task = resolveWallet().finally(() => {
      ensureWalletPromise = null;
    });
    ensureWalletPromise = task;
    return task;
  }, [resolveWallet]);

  const sign = useCallback(
    async (base64Tx: string): Promise<string> => {
      // Sign with the wallet the server was told about, never merely the first one Privy lists:
      // the transaction names that key as signer, and a signature from any other wallet leaves
      // its slot empty.
      const linked = await ensureWallet();
      // Latest state, not this render's closure: `ensureWallet` may have waited out a reconnect
      // that only later renders saw finish.
      const wallet = primaryWalletOf(latest.current.solanaWallet);
      if (!wallet || wallet.address !== linked) throw WalletError.notAuthenticated();

      let transaction: VersionedTransaction;
      try {
        transaction = VersionedTransaction.deserialize(Buffer.from(base64Tx, 'base64'));
      } catch {
        throw WalletError.malformedTransaction();
      }

      try {
        const provider = await wallet.getProvider();
        // signTransaction, never signMessage: signMessage signs the given bytes verbatim, so
        // handing it a serialised transaction yields a signature covering the 65-byte signature
        // prefix too, which the network rejects. signTransaction signs the message portion and
        // splices the signature back in at the right offset.
        const { signedTransaction } = await provider.request({
          method: 'signTransaction',
          params: { transaction },
        });
        return Buffer.from(signedTransaction.serialize()).toString('base64');
      } catch (error) {
        throw WalletError.signingFailed(describeUnknownError(error));
      }
    },
    [ensureWallet, primaryWalletOf],
  );

  const reset = useCallback(async (): Promise<void> => {
    ensureWalletPromise = null;
    if (user) await logout();
  }, [logout, user]);

  return { isReady, publicKey: primaryWallet()?.address ?? null, ensureWallet, sign, reset };
}

/** Test-only: clears the module-level single-flight guard between tests. */
export function _resetEnsureWalletGuardForTests(): void {
  ensureWalletPromise = null;
}
