/**
 * Android vault wallet: the member's own wallet app via Solana Mobile Wallet Adapter. Publishes
 * the same `WalletHandle` `PrivyVaultProvider` does (iOS), so the signing pipeline, verifier and
 * every flow stay unchanged. Mounted instead of `PrivyVaultProvider` on Android (`_layout.tsx`).
 * Importing it on iOS is safe: `mwaSession` loads the MWA native package lazily, Android only.
 */
import { useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { useMe } from '@/features/me/useMe';

import { useWeb3Enabled } from '../../web3Flag';
import { WalletError } from '../walletError';
import { setWalletHandle, type WalletHandle } from '../walletHandle';
import {
  connectMwaWallet,
  disconnectMwaWallet,
  loadMwaConnection,
  signWithMwa,
} from './mwaSession';

/** The cached connection, tagged with the user it was read for (a user switch invalidates it). */
interface CachedAddress {
  userId: number;
  address: string | null;
}

export function MwaVaultProvider({ children }: PropsWithChildren) {
  const userId = useMe().data?.id ?? null;
  const isConfigured = useWeb3Enabled() && userId !== null;
  const [cached, setCached] = useState<CachedAddress | null>(null);
  // One wallet session at a time: a double-tapped Connect, a deposit/pay racing a Connect tap,
  // or a retry after the seam's 120 s timeout (which cannot cancel the still-running `transact`)
  // all join the in-flight connect instead of opening a second SIWS challenge + wallet intent.
  // Outside the `useMemo` so a handle republished mid-connect still sees it.
  const inflight = useRef<{ userId: number; p: Promise<string> } | null>(null);
  // Bumped by `reset` (sign-out / Disconnect): a connect started before it neither gets joined
  // afterwards nor persists/caches its connection when it finally settles, and a sign started
  // before it does not write its refreshed / dropped token back.
  const generation = useRef(0);

  useEffect(() => {
    if (userId === null) return undefined;
    let live = true;
    // State is only set from the async callbacks, never synchronously in the effect body.
    loadMwaConnection(userId)
      .then((conn) => {
        if (live) setCached({ userId, address: conn?.address ?? null });
      })
      .catch(() => {
        if (live) setCached({ userId, address: null });
      });
    return () => {
      live = false;
    };
  }, [userId]);

  // Derived, so a stale entry from a previous user never leaks into this one.
  const loaded = cached !== null && cached.userId === userId;
  const address = loaded ? cached.address : null;

  const handle = useMemo<WalletHandle>(() => {
    const connect = (): Promise<string> => {
      if (userId === null) return Promise.reject(WalletError.notAuthenticated());
      const current = inflight.current;
      if (current && current.userId === userId) return current.p;
      const startedIn = generation.current;
      const isCurrent = () => generation.current === startedIn;
      // After a reset, still settles for its caller, but neither persists nor caches the address.
      const p = connectMwaWallet(userId, { isCurrent })
        .then((conn) => {
          if (isCurrent()) setCached({ userId, address: conn.address });
          return conn.address;
        })
        .finally(() => {
          // Cleared on failure/cancel too, so the member can retry. Only our own entry.
          if (inflight.current?.p === p) inflight.current = null;
        });
      inflight.current = { userId, p };
      return p;
    };
    return {
      kind: 'mwa',
      isConfigured,
      isReady: loaded,
      connectedAddress: address,
      connect,
      // Deposit/pay/withdraw are user-initiated, so opening the wallet here is expected. Reads
      // SecureStore rather than `address` so a call racing the initial load never re-prompts.
      ensureWallet: async () => {
        if (userId === null) throw WalletError.notAuthenticated();
        const conn = await loadMwaConnection(userId);
        return conn?.address ?? connect();
      },
      sign: (base64Tx: string) => {
        if (userId === null) return Promise.reject(WalletError.notAuthenticated());
        const startedIn = generation.current;
        return signWithMwa(userId, base64Tx, { isCurrent: () => generation.current === startedIn });
      },
      // Local only (sign-out hook + Disconnect): never opens the wallet app. Runs even with web3
      // off (`resetVaultWallet` always resets an MWA handle).
      reset: async () => {
        generation.current += 1;
        inflight.current = null;
        if (userId === null) return;
        await disconnectMwaWallet(userId);
        setCached({ userId, address: null });
      },
    };
  }, [address, isConfigured, loaded, userId]);

  useEffect(() => {
    setWalletHandle(handle);
    return () => setWalletHandle(null);
  }, [handle]);

  return <>{children}</>;
}
