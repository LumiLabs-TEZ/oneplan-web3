/**
 * Generic sign-and-submit pipeline: server-built base64 tx → `TransactionVerifier` (expectations
 * built by the caller from what the user confirmed on screen, per the security audit — never
 * trust expected values echoed by the server, S-4/S-4b) → Privy `signTransaction` → the submit
 * endpoint → an optional post-submit confirmation wait.
 *
 * Deliberately generic (per-instruction `verify`/`submit`/`confirm` closures) so Wave A's deposit
 * flow (`depositFlow.ts`) and Wave B's pay/propose/approve/cancel flows share one implementation
 * instead of four copies of the same sign-timeout/error-mapping logic.
 */
import { signVaultTransaction } from '../wallet/walletHandle';
import { describeUnknownError, WalletError } from '../wallet/walletError';

const DEFAULT_SIGN_TIMEOUT_MS = 60_000;

export interface SignAndSubmitParams<TResult> {
  /** The unsigned base64 transaction the server built — already fetched by the caller. */
  unsignedTx: string;
  /**
   * Throws (typically a `SolanaDecodeError` from `TransactionVerifier`) unless `unsignedTx`
   * matches what the user confirmed. Run before signing so a mismatch never reaches the wallet.
   */
  verify: () => void;
  /**
   * Called once, right after `sign` returns and before `submit`. From this point a signature
   * exists, so a caller that keeps bookkeeping for the attempt (e.g. `payVault`'s "abandon the
   * prepared row") must stop treating a later failure as "never signed".
   */
  onSigned?: () => void;
  /** POSTs the signed transaction; returns whatever the endpoint returns. */
  submit: (signedTx: string) => Promise<TResult>;
  /**
   * Optional post-submit wait, e.g. polling for an on-chain status to settle. No-ops (returns
   * `result` unchanged) by default — most vault endpoints are synchronous-or-pending and need no
   * client poll (the server's reconcile job owns a `PENDING` result, see
   * `docs/web3/rn-ui-parity-inventory.md` `vault-pay-and-approve-orchestration` row).
   */
  confirm?: (result: TResult) => Promise<TResult>;
  /** Injectable for tests; defaults to the live Privy wallet via `walletHandle.ts`. */
  sign?: (base64Tx: string) => Promise<string>;
  signTimeoutMs?: number;
  confirmTimeoutMs?: number;
}

/** Any rejection at the sign/confirm stage is a `WalletError`, mirroring `WalletService.swift`. */
function toWalletError(error: unknown): WalletError {
  return error instanceof WalletError
    ? error
    : WalletError.signingFailed(describeUnknownError(error));
}

function withTimeout<T>(run: () => Promise<T>, ms: number, stage: 'sign' | 'confirm'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(WalletError.signingFailed(`timed out waiting to ${stage}`));
    }, ms);

    run().then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(toWalletError(error));
      },
    );
  });
}

/**
 * Verifies, signs (bounded by `signTimeoutMs`), submits, and optionally confirms (bounded by
 * `confirmTimeoutMs`). `verify()`'s throw and `submit()`'s throw (an `ApiMutationError`)
 * propagate unwrapped, matching how iOS lets `TransactionVerifier` / `APIClient` errors surface
 * as-is — only the sign and confirm stages are wrapped in `WalletError`, mirroring
 * `WalletService.swift`'s `sign(base64Tx:)`.
 */
export async function signAndSubmit<TResult>(params: SignAndSubmitParams<TResult>): Promise<TResult> {
  params.verify();

  const sign = params.sign ?? signVaultTransaction;
  const signed = await withTimeout(
    () => sign(params.unsignedTx),
    params.signTimeoutMs ?? DEFAULT_SIGN_TIMEOUT_MS,
    'sign',
  );

  params.onSigned?.();

  const result = await params.submit(signed);
  if (!params.confirm) return result;

  return withTimeout(
    () => params.confirm!(result),
    params.confirmTimeoutMs ?? DEFAULT_SIGN_TIMEOUT_MS,
    'confirm',
  );
}
