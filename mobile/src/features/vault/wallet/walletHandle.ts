/**
 * Bridges the wallet React providers — `PrivyVaultProvider` (iOS: Privy hooks `usePrivy`,
 * `useEmbeddedSolanaWallet`) and `MwaVaultProvider` (Android: the member's own wallet app over
 * Solana Mobile Wallet Adapter) — to imperative call sites that are not components: the signing
 * pipeline (`@/features/vault/signing`), the auth sign-in/sign-out bootstrap, and any mutation's
 * `onSuccess`. The mounted provider publishes its current handle into `setWalletHandle` whenever
 * it changes; everything else reads through the functions below, matching how `realtimeClient()`
 * exposes a singleton outside React (`@/realtime/useRealtime.ts`).
 */
import { WalletError } from './walletError';
import { MWA_WALLET_TIMEOUT_MS, withWalletTimeout } from './walletTimeout';

export interface WalletHandle {
  /** Which backend published this handle: Privy embedded (iOS) or the member's own MWA wallet (Android). */
  kind: 'privy' | 'mwa';
  isConfigured: boolean;
  isReady: boolean;
  /** Linked address if already connected, else null. Never opens UI. */
  connectedAddress: string | null;
  ensureWallet: () => Promise<string>;
  /** User-initiated: opens the wallet (MWA) or creates the embedded wallet (Privy). */
  connect: () => Promise<string>;
  sign: (base64Tx: string) => Promise<string>;
  reset: () => Promise<void>;
}

let handle: WalletHandle | null = null;
const listeners = new Set<() => void>();

/** Called by the mounted wallet provider; not for feature code to call directly. */
export function setWalletHandle(next: WalletHandle | null): void {
  handle = next;
  listeners.forEach((listener) => listener());
}

/**
 * `useSyncExternalStore` subscription: fires whenever the provider republishes its handle (e.g.
 * the MWA connection loads from SecureStore, connects or disconnects), so components showing
 * `vaultWalletKind()` / `connectedVaultWalletAddress()` stay current. Returns the unsubscribe.
 */
export function subscribeWalletHandle(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test-only. */
export function _resetWalletHandleForTests(): void {
  handle = null;
}

function requireHandle(): WalletHandle {
  // The platform's wallet provider is mounted once at the app root (`src/app/_layout.tsx`) and
  // always publishes a handle, even when unconfigured — null here means it hasn't mounted yet
  // (e.g. a call that races app boot), which is functionally the same as "not configured".
  if (!handle) throw WalletError.notConfigured();
  if (!handle.isConfigured) throw WalletError.notConfigured();
  return handle;
}

/**
 * Bounds a wallet setup step. Privy can sit in a not-ready state and never settle `create()`, so
 * it gets `WALLET_SETUP_TIMEOUT_MS`. MWA means the member is approving a prompt in another app,
 * which must not be cut off at 20 s — but must still end if they never return.
 */
function boundSetup<T>(h: WalletHandle, task: Promise<T>): Promise<T> {
  return h.kind === 'mwa'
    ? withWalletTimeout(task, MWA_WALLET_TIMEOUT_MS)
    : withWalletTimeout(task);
}

/**
 * Returns the linked wallet address, creating the embedded wallet (Privy) or opening the wallet
 * app (MWA, only when nothing is cached) on first use. `async` so `requireHandle()`'s synchronous
 * throw (not-configured) becomes a rejected promise like every other failure here, instead of
 * throwing out of the call expression itself. Rejects with `WalletError.sessionFailed('timed out')`
 * if it has not settled within `WALLET_SETUP_TIMEOUT_MS` (Privy) / `MWA_WALLET_TIMEOUT_MS` (MWA).
 */
export async function ensureVaultWallet(): Promise<string> {
  const h = requireHandle();
  return boundSetup(h, h.ensureWallet());
}

/** Explicit "Connect wallet" tap. Bounded like `ensureVaultWallet` (MWA 120 s, Privy 20 s). */
export async function connectVaultWallet(): Promise<string> {
  const h = requireHandle();
  return boundSetup(h, h.connect());
}

export function vaultWalletKind(): 'privy' | 'mwa' | null {
  return handle?.kind ?? null;
}

export function connectedVaultWalletAddress(): string | null {
  return handle?.connectedAddress ?? null;
}

/**
 * Signs a server-built transaction. Callers MUST have already run
 * `TransactionVerifier.verify`/`verifyTokenTransfer` against it — this function does not verify,
 * so the check can never be skipped by calling this with different arguments than were checked.
 */
export async function signVaultTransaction(base64Tx: string): Promise<string> {
  const h = requireHandle();
  // MWA: the member signs in their wallet app and may never return; Privy signs in-process.
  return h.kind === 'mwa'
    ? withWalletTimeout(h.sign(base64Tx), MWA_WALLET_TIMEOUT_MS)
    : h.sign(base64Tx);
}

/**
 * Clears wallet state (account switch / sign-out / Disconnect): the Privy session, or for MWA the
 * locally cached connection only (never opens the wallet app). An unconfigured Privy handle
 * no-ops; an MWA handle always resets, because web3 may have been switched off after the member
 * connected and their SecureStore connection must still go on sign-out.
 */
export async function resetVaultWallet(): Promise<void> {
  if (!handle) return;
  if (handle.kind !== 'mwa' && !handle.isConfigured) return;
  await handle.reset();
}

export function isVaultWalletConfigured(): boolean {
  return handle?.isConfigured ?? false;
}

export function isVaultWalletReady(): boolean {
  return handle?.isReady ?? false;
}
