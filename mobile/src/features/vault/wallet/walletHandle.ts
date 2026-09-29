/**
 * Bridges the Privy React hooks (`usePrivy`, `useEmbeddedSolanaWallet`), which only work inside
 * a component under `<PrivyVaultProvider>`, to imperative call sites that are not components:
 * the signing pipeline (`@/features/vault/signing`), the auth sign-in/sign-out bootstrap, and
 * any mutation's `onSuccess`. `PrivyVaultProvider`'s inner bridge component publishes its
 * current `{ ensureWallet, sign, reset, isConfigured, isReady }` into `setWalletHandle` on every
 * render; everything else reads through the functions below, matching how `realtimeClient()`
 * exposes a singleton outside React (`@/realtime/useRealtime.ts`).
 */
import { WalletError } from './walletError';
import { withWalletTimeout } from './walletTimeout';

export interface WalletHandle {
  isConfigured: boolean;
  isReady: boolean;
  ensureWallet: () => Promise<string>;
  sign: (base64Tx: string) => Promise<string>;
  reset: () => Promise<void>;
}

let handle: WalletHandle | null = null;

/** Called by `PrivyVaultProvider`'s bridge component; not for feature code to call directly. */
export function setWalletHandle(next: WalletHandle | null): void {
  handle = next;
}

/** Test-only. */
export function _resetWalletHandleForTests(): void {
  handle = null;
}

function requireHandle(): WalletHandle {
  // `PrivyVaultProvider` is mounted once at the app root (`src/app/_layout.tsx`) and always
  // publishes a handle, even when unconfigured — null here means it hasn't mounted yet (e.g. a
  // call that races app boot), which is functionally the same as "not configured" to a caller.
  if (!handle) throw WalletError.notConfigured();
  if (!handle.isConfigured) throw WalletError.notConfigured();
  return handle;
}

/**
 * Returns the linked wallet address, creating the embedded wallet on first use. `async` so
 * `requireHandle()`'s synchronous throw (not-configured) becomes a rejected promise like every
 * other failure here, instead of throwing out of the call expression itself. Rejects with
 * `WalletError.sessionFailed('timed out')` if it has not settled within `WALLET_SETUP_TIMEOUT_MS`.
 */
export async function ensureVaultWallet(): Promise<string> {
  // Bounded: Privy can sit in a not-ready state and never settle `create()`; every caller shows
  // a spinner while this runs, so it must end in an error, not hang.
  return withWalletTimeout(requireHandle().ensureWallet());
}

/**
 * Signs a server-built transaction. Callers MUST have already run
 * `TransactionVerifier.verify`/`verifyTokenTransfer` against it — this function does not verify,
 * so the check can never be skipped by calling this with different arguments than were checked.
 */
export async function signVaultTransaction(base64Tx: string): Promise<string> {
  return requireHandle().sign(base64Tx);
}

/** Clears wallet state and the Privy session (account switch / sign-out). No-ops when unconfigured. */
export async function resetVaultWallet(): Promise<void> {
  if (!handle?.isConfigured) return;
  await handle.reset();
}

export function isVaultWalletConfigured(): boolean {
  return handle?.isConfigured ?? false;
}

export function isVaultWalletReady(): boolean {
  return handle?.isReady ?? false;
}
