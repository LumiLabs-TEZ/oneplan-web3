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

export interface UseVaultWalletResult {
  isReady: boolean;
  publicKey: string | null;
  ensureWallet: () => Promise<string>;
  sign: (base64Tx: string) => Promise<string>;
  reset: () => Promise<void>;
}

export function useVaultWallet(): UseVaultWalletResult {
  const { user, isReady, logout } = usePrivy();
  const solanaWallet = useEmbeddedSolanaWallet();
  // Latest render's Privy state, so a wait started in an earlier render sees Privy settle.
  const latest = useRef({ isReady, solanaWallet });
  latest.current = { isReady, solanaWallet };

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
   * to settle instead — bounded, and a hard `error` status still fails immediately.
   */
  const waitForPrivy = useCallback(async (): Promise<void> => {
    const deadline = Date.now() + PRIVY_READY_WAIT_MS;
    for (;;) {
      const { isReady: ready, solanaWallet: current } = latest.current;
      const status = current.status;
      if (status === 'error') return;
      if (ready && (status === 'connected' || status === 'not-created')) return;
      if (Date.now() >= deadline) return;
      await new Promise<void>((resolve) => setTimeout(resolve, PRIVY_READY_POLL_MS));
    }
  }, []);

  const resolveWallet = useCallback(async (): Promise<string> => {
    await waitForPrivy();
    // The render this closure captured predates the wait; re-read through the latest state.
    const current = latest.current.solanaWallet;
    const existing = primaryWalletOf(current);
    if (existing) return existing.address;

    if (current.status !== 'not-created') {
      // Privy is still resolving the wallet list (or failed to) — ask again shortly rather than
      // calling `create()` in a status it does not accept from.
      throw WalletError.sessionNotReady();
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
      const wallet = primaryWallet();
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
    [ensureWallet, primaryWallet],
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
