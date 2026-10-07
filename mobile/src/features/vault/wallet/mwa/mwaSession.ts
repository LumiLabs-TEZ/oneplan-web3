/**
 * Solana Mobile Wallet Adapter session for the Android vault wallet: the member's own wallet app
 * (Phantom, Solflare, Seed Vault Wallet…) signs, OnePlan never holds a key. The ONLY module that
 * loads MWA — Android-only native code that throws at import time elsewhere
 * (`TurboModuleRegistry.getEnforcing`), so it is required lazily and iOS never evaluates it
 * (`_layout.tsx` imports `MwaVaultProvider`, and with it this file, on every platform).
 *
 * Sign-only (`signTransactions`), never sign-and-send: the server is fee payer and broadcaster,
 * and re-verifies the exact bytes it built (`tx-verify.ts`) before sending them.
 *
 * Never log auth tokens, signatures or SIWS messages from here.
 */
import type { transact as TransactFn } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { type Transaction, VersionedTransaction } from '@solana/web3.js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

import { ApiMutationError } from '@/api/mutationError';
import { encodeBase58 } from '@/features/vault/solana/transactionVerifier';

import { createSiwsChallenge, linkWalletSiws } from '../../api/mwa';
import { describeUnknownError, WalletError } from '../walletError';
import { mergeWalletSignatures } from './signatureSlots';

export const MWA_IDENTITY = {
  name: 'OnePlan',
  uri: 'https://oneplan.space',
  icon: 'favicon.ico',
} as const;
/** Fixed: this build only moves money on devnet (`env.ts` has no cluster field). */
const CHAIN = 'solana:devnet';
/**
 * A -1 to the token-bearing `authorize` faster than this came back with no human in the loop, so
 * the wallet rejected the token itself (dead token). Slower means the wallet showed a prompt and
 * the member declined it.
 */
export const TOKEN_REJECT_FAST_MS = 1500;

export interface MwaConnection {
  /** base58 */
  address: string;
  /**
   * null after the member declined a saved-token prompt (`signWithMwa`): that token may be dead,
   * so the next sign authorizes without one (one fresh connect prompt) and stores the new token.
   */
  authToken: string | null;
  walletUriBase: string;
}

/** Cap on waiting for OnePlan to come back in front after a wallet session (`waitForForeground`). */
export const FOREGROUND_WAIT_MS = 10_000;
/** Pause before the single retry of a request that failed at the network layer. */
export const NETWORK_RETRY_DELAY_MS = 1500;

/**
 * Resolves once OnePlan is the foreground app again, or after `timeoutMs` regardless. The wallet
 * session can end while the wallet app is still in front, and Android (Battery Saver / Data
 * Saver, background restrictions) cuts a backgrounded app's network: a request sent right then
 * fails with `UnknownHostException` before it leaves the phone.
 */
export function waitForForeground(timeoutMs: number = FOREGROUND_WAIT_MS): Promise<void> {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      sub.remove();
      resolve();
    };
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') done();
    });
    const timer = setTimeout(done, timeoutMs);
  });
}

const NETWORK_FAILURE =
  /network request failed|failed to fetch|fetch failed|unknownhost|unable to resolve host|connectexception|sockettimeout/i;

/** A request that never reached the server (no DNS, no route, dropped socket) — not an HTTP answer. */
export function isNetworkFailure(error: unknown): boolean {
  if (error instanceof ApiMutationError || error instanceof WalletError) return false;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && NETWORK_FAILURE.test(message);
}

async function withNetworkRetry<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (!isNetworkFailure(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_DELAY_MS));
    return request();
  }
}

const storageKey = (userId: number) => `mwa.connection.${userId}`;
const base64ToBase58 = (value: string) => encodeBase58(Uint8Array.from(Buffer.from(value, 'base64')));

/** Lazy, Android-only: never evaluate the MWA package (and its native module lookup) on iOS. */
function mwaTransact(): typeof TransactFn {
  if (Platform.OS !== 'android') throw WalletError.notConfigured();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mwa = require('@solana-mobile/mobile-wallet-adapter-protocol-web3js') as {
    transact: typeof TransactFn;
  };
  return mwa.transact;
}

/**
 * The MWA protocol error code (-1 ERROR_AUTHORIZATION_FAILED, -3 ERROR_NOT_SIGNED…) in either shape:
 * numeric `code` once `transact` has converted it (`SolanaMobileWalletAdapterProtocolError`), or
 * the raw React Native rejection `{ code: 'JSON_RPC_ERROR', userInfo: { jsonRpcErrorCode } }`.
 * Inside the `transact` callback only the raw shape occurs: MWA 2.3.0's wallet proxy returns
 * `invoke`'s promise un-awaited, so its `handleError` never sees the rejection.
 */
function protocolCode(error: unknown): number | undefined {
  const { code, userInfo } = (error ?? {}) as {
    code?: unknown;
    userInfo?: { jsonRpcErrorCode?: unknown } | null;
  };
  if (typeof code === 'number') return code;
  if (code === 'JSON_RPC_ERROR' && typeof userInfo?.jsonRpcErrorCode === 'number') {
    return userInfo.jsonRpcErrorCode;
  }
  return undefined;
}

/**
 * MWA throws `SolanaMobileWalletAdapterError` (string codes) or protocol errors (numeric codes, or
 * raw `JSON_RPC_ERROR` from inside the callback: `protocolCode`).
 * On Android the native module rejects with the Java throwable's message as the `code`
 * (`SolanaMobileWalletAdapterModule.kt`), and Android freezes the backgrounded app ~70 s into a
 * wallet session, so timeouts surface here as raw strings.
 */
function toWalletError(error: unknown): WalletError {
  if (error instanceof WalletError) return error;
  if (isNetworkFailure(error)) return WalletError.network();
  const code = (error as { code?: unknown } | null)?.code;
  const message = (error as { message?: unknown } | null)?.message;
  if (code === 'ERROR_WALLET_NOT_FOUND') return WalletError.walletNotInstalled();
  // "Timed out waiting for local association to be ready" / "Timed out waiting for response", or a
  // raw java TimeoutException (often under 'EUNSPECIFIED'). Before the EUNSPECIFIED → cancelled
  // rule below, so a frozen-app timeout is not shown as a quiet cancel.
  const isTimeout = (value: unknown) =>
    typeof value === 'string' && (value.startsWith('Timed out') || value.includes('TimeoutException'));
  if (isTimeout(code) || isTimeout(message)) return WalletError.walletTimedOut();
  if (code === 'Session not established: Local association cancelled by user') return WalletError.cancelled();
  // Rejects from `transact`'s finally and REPLACES the callback's result: the signature is lost,
  // nothing was broadcast, the member just retries.
  if (code === 'Failed to end session') return WalletError.sessionFailed('wallet session ended unexpectedly');
  // -1 ERROR_AUTHORIZATION_FAILED (declined authorize/SIWS), -3 ERROR_NOT_SIGNED (declined
  // signing), 'EUNSPECIFIED' = Back press / left the wallet (Android CancellationException; seen
  // on device instead of ERROR_ASSOCIATION_CANCELLED, which is kept for other wallets).
  const rpcCode = protocolCode(error);
  if (code === 'ERROR_ASSOCIATION_CANCELLED' || code === 'EUNSPECIFIED' || rpcCode === -1 || rpcCode === -3) {
    return WalletError.cancelled();
  }
  return WalletError.signingFailed(describeUnknownError(error));
}

export async function loadMwaConnection(userId: number): Promise<MwaConnection | null> {
  const raw = await SecureStore.getItemAsync(storageKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MwaConnection;
  } catch {
    return null;
  }
}

async function saveConnection(userId: number, conn: MwaConnection | null): Promise<void> {
  if (conn) await SecureStore.setItemAsync(storageKey(userId), JSON.stringify(conn));
  else await SecureStore.deleteItemAsync(storageKey(userId));
}

export interface ConnectMwaOptions {
  /**
   * Checked right before the connection is saved. False = the caller abandoned this connect
   * (Disconnect / sign-out while the wallet was open): the connection is still returned, and the
   * server link already made stands, but nothing is persisted locally.
   */
  isCurrent?: () => boolean;
}

/** Opens the wallet once: connect + Sign-In-With-Solana, then links the proven key server-side. */
export async function connectMwaWallet(
  userId: number,
  options: ConnectMwaOptions = {},
): Promise<MwaConnection> {
  try {
    const transact = mwaTransact();
    const challenge = await createSiwsChallenge();
    const result = await transact((wallet) =>
      wallet.authorize({
        chain: CHAIN,
        identity: MWA_IDENTITY,
        // Server-built, always carries `domain` (MWA would otherwise read `window.location.host`,
        // which RN lacks).
        sign_in_payload: challenge.input,
      }),
    );
    const signIn = result.sign_in_result;
    if (!signIn) throw WalletError.signingFailed('wallet did not return a sign-in signature');
    await waitForForeground();
    // Same proof on a retry: the challenge token is stateless (5-min TTL) and a same-key re-link is
    // a no-op, so a first attempt that did reach the server is harmless.
    await withNetworkRetry(() =>
      linkWalletSiws({
        challengeToken: challenge.challengeToken,
        address: signIn.address,
        signedMessage: signIn.signed_message,
        signature: signIn.signature,
      }),
    );
    const conn: MwaConnection = {
      address: base64ToBase58(signIn.address),
      authToken: result.auth_token,
      walletUriBase: result.wallet_uri_base,
    };
    if (options.isCurrent?.() ?? true) await saveConnection(userId, conn);
    return conn;
  } catch (error) {
    // Server answers (409 wallet_locked_by_vault, 409 already linked elsewhere, 401 bad SIWS)
    // carry their own status/code for the UI; only wallet-side failures become WalletError.
    if (error instanceof ApiMutationError) throw error;
    throw toWalletError(error);
  }
}

export interface SignWithMwaOptions {
  /**
   * Checked right before each connection save (token refresh, slow -1 token drop). False = a
   * Disconnect / sign-out happened while the wallet was open: the sign still settles, but the
   * cleared connection is not written back.
   */
  isCurrent?: () => boolean;
}

/** Callers MUST have verified `base64Tx` already (same contract as `signVaultTransaction`). */
export async function signWithMwa(
  userId: number,
  base64Tx: string,
  options: SignWithMwaOptions = {},
): Promise<string> {
  const isCurrent = () => options.isCurrent?.() ?? true;
  const conn = await loadMwaConnection(userId);
  if (!conn) throw WalletError.sessionNotReady();
  const original = Uint8Array.from(Buffer.from(base64Tx, 'base64'));
  let tx: VersionedTransaction;
  try {
    tx = VersionedTransaction.deserialize(original);
  } catch {
    throw WalletError.malformedTransaction();
  }
  try {
    const transact = mwaTransact();
    const signed = await transact(async (wallet) => {
      let auth;
      if (conn.authToken === null) {
        // A previous saved-token prompt was declined: ask afresh (a -1 here is a decline).
        auth = await wallet.authorize({ chain: CHAIN, identity: MWA_IDENTITY });
      } else {
        const startedAt = Date.now();
        try {
          auth = await wallet.authorize({ chain: CHAIN, identity: MWA_IDENTITY, auth_token: conn.authToken });
        } catch (error) {
          if (protocolCode(error) !== -1) throw error;
          // MWA 2.0 spec: ERROR_AUTHORIZATION_FAILED (-1) for a supplied auth_token means the
          // token is dead (revoked, expired, wallet reinstalled). But some wallets prompt on a
          // saved token too, and a decline there is also -1. A fast -1 (no prompt could have been
          // answered) is a dead token: re-authorize without it in the same session (the wallet
          // shows its connect prompt). A slow one is the member declining: no second prompt now,
          // but the token is dropped (keeping the address) so the next sign asks once without
          // it, instead of retrying a possibly dead token forever.
          if (Date.now() - startedAt >= TOKEN_REJECT_FAST_MS) {
            if (isCurrent()) await saveConnection(userId, { ...conn, authToken: null });
            throw WalletError.cancelled();
          }
          auth = await wallet.authorize({ chain: CHAIN, identity: MWA_IDENTITY });
        }
      }
      const account = auth.accounts[0];
      // The member switched accounts inside their wallet app: this key is not the one the vault
      // knows, so its signature would be rejected on chain. Stop before showing a sign prompt.
      if (!account || base64ToBase58(account.address) !== conn.address) {
        throw WalletError.notAuthenticated();
      }
      if (auth.auth_token !== conn.authToken && isCurrent()) {
        await saveConnection(userId, { ...conn, authToken: auth.auth_token });
      }
      // Typed `VersionedTransaction[]`, but MWA decodes a legacy message back into a `Transaction`.
      const results: (Transaction | VersionedTransaction)[] = await wallet.signTransactions({
        transactions: [tx],
      });
      const out = results[0];
      if (!out) throw WalletError.signingFailed('wallet returned no transaction');
      // A legacy Transaction's default serialize() verifies every signature and throws when the
      // wallet zeroed the fee-payer slot — exactly the case mergeWalletSignatures repairs.
      return 'version' in out
        ? out.serialize()
        : out.serialize({ requireAllSignatures: false, verifySignatures: false });
    });
    const merged = Buffer.from(mergeWalletSignatures(original, Uint8Array.from(signed))).toString('base64');
    // The caller submits these bytes to the server next: don't hand them back while OnePlan may
    // still be behind the wallet app with its network cut (`waitForForeground`).
    await waitForForeground();
    return merged;
  } catch (error) {
    if (error instanceof Error && error.message === 'message_changed') {
      throw WalletError.signingFailed('wallet modified the transaction');
    }
    if (error instanceof Error && error.message === 'signature_count_changed') {
      throw WalletError.signingFailed('wallet changed the signer list');
    }
    throw toWalletError(error);
  }
}

/**
 * Local only: forgets the cached connection. Deliberately no `transact`/`deauthorize` — that
 * launches the wallet app, and this runs on every OnePlan sign-out. The server link persists;
 * connecting again re-runs SIWS (and the re-link guard).
 */
export async function disconnectMwaWallet(userId: number): Promise<void> {
  await saveConnection(userId, null);
}
