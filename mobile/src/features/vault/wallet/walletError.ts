/**
 * Port of `WalletError` (`ios/OnePlan/OnePlan/Services/WalletService.swift`,
 * `origin/feat/web3-version`). Same case set, same meaning — every i18n key below already
 * exists in `src/i18n/locales/en.json` (ported alongside the other 278 web3 strings), so a
 * screen renders one with `t(walletErrorMessageKey(err), { 0: err.reason })` /
 * `t(walletErrorMessageKey(err))` for the no-argument cases. This module never calls `t()`
 * itself — only components may (`useAppLanguage()` gates memoisation, see AGENTS.md).
 */
export type WalletErrorKind =
  | 'notConfigured'
  | 'sessionNotReady'
  | 'notAuthenticated'
  | 'sessionFailed'
  | 'creationFailed'
  | 'malformedTransaction'
  | 'signingFailed'
  | 'cancelled'
  | 'walletNotInstalled'
  | 'walletTimedOut'
  | 'network';

export class WalletError extends Error {
  readonly kind: WalletErrorKind;
  readonly reason?: string;

  constructor(kind: WalletErrorKind, reason?: string) {
    super(reason !== undefined ? `${kind}: ${reason}` : kind);
    this.name = 'WalletError';
    this.kind = kind;
    this.reason = reason;
  }

  /** Wallet not built into this variant, or Privy ids unset (`env.privyAppId`/`privyClientId`). */
  static notConfigured(): WalletError {
    return new WalletError('notConfigured');
  }
  /** Configured, but the Privy session/wallet isn't resolved yet — retry shortly. */
  static sessionNotReady(): WalletError {
    return new WalletError('sessionNotReady');
  }
  /** The signing wallet no longer matches the address the server was told about. */
  static notAuthenticated(): WalletError {
    return new WalletError('notAuthenticated');
  }
  /** Custom-auth token exchange / Privy session establishment failed. */
  static sessionFailed(reason: string): WalletError {
    return new WalletError('sessionFailed', reason);
  }
  /** `create()` on the embedded Solana wallet failed. */
  static creationFailed(reason: string): WalletError {
    return new WalletError('creationFailed', reason);
  }
  /** The server-built base64 transaction could not be decoded. */
  static malformedTransaction(): WalletError {
    return new WalletError('malformedTransaction');
  }
  /**
   * Any signing failure: SDK error, or a client-side timeout waiting for the signing UI to
   * resolve. On the Privy path (and in Swift) a user decline also lands here; the Android MWA
   * path reports a decline as `cancelled()` instead.
   */
  static signingFailed(reason: string): WalletError {
    return new WalletError('signingFailed', reason);
  }
  /** The member dismissed the wallet's prompt. Screens treat this as a no-op, not a failure. */
  static cancelled(): WalletError {
    return new WalletError('cancelled');
  }
  /** Android only: no MWA-compatible wallet app (Phantom, Solflare, Seed Vault…) is installed. */
  static walletNotInstalled(): WalletError {
    return new WalletError('walletNotInstalled');
  }
  /** Android only: the wallet session timed out (wallet silent, or Android froze OnePlan meanwhile). */
  static walletTimedOut(): WalletError {
    return new WalletError('walletTimedOut');
  }
  /** The wallet answered, but OnePlan's own request (SIWS challenge/link) never reached the server. */
  static network(): WalletError {
    return new WalletError('network');
  }
}

/** The exact `Localizable.xcstrings`-sourced i18n key for each case (see `en.json`). */
export function walletErrorMessageKey(error: WalletError): string {
  switch (error.kind) {
    case 'notConfigured':
      return 'Wallet is not configured for this build.';
    case 'sessionNotReady':
      return 'Wallet session is not ready yet. Please try again in a moment.';
    case 'notAuthenticated':
      return 'Sign in before using the group wallet.';
    case 'sessionFailed':
      return 'Could not reach the wallet service: %@';
    case 'creationFailed':
      return 'Could not create your wallet: %@';
    case 'malformedTransaction':
      return 'The server returned a transaction this app cannot read.';
    case 'signingFailed':
      return 'Could not sign: %@';
    case 'cancelled':
      return 'Cancelled in your wallet.';
    case 'walletNotInstalled':
      return 'Install a Solana wallet app to continue.';
    case 'walletTimedOut':
      return 'Your wallet took too long to respond. Go back to OnePlan and try again.';
    case 'network':
      return 'Please check your connection and try again.';
  }
}

/** Best-effort message extraction from whatever the Privy SDK / native layer throws. */
export function describeUnknownError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
