import { WalletError } from './walletError';

/** Upper bound for any wallet setup step a screen shows a spinner for. */
export const WALLET_SETUP_TIMEOUT_MS = 20_000;

/**
 * Upper bound for an MWA connect/sign. The member is approving inside their own wallet app, so
 * 20 s is far too short — but if they never come back, the spinner must still end in an error.
 */
export const MWA_WALLET_TIMEOUT_MS = 120_000;

/**
 * Rejects with `WalletError.sessionFailed('timed out')` if `task` has not settled in `ms`, so a
 * promise that never resolves (Privy never becomes ready, a stalled connection) surfaces as an
 * error instead of an endless spinner. The underlying task is not cancelled — it can't be — but
 * nothing awaits it any more.
 */
export function withWalletTimeout<T>(task: Promise<T>, ms = WALLET_SETUP_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(WalletError.sessionFailed('timed out')), ms);
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
