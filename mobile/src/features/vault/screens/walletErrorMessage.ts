import type { TFunction } from 'i18next';

import { WalletError, walletErrorMessageKey } from '../wallet/walletError';

/**
 * 409 `tx_expired`: the server built the transaction with a blockhash that expired while the
 * member was still approving it in the wallet, so it could never land. Carried by both
 * `ApiMutationError` (deposit/withdraw) and `VaultPayError` (pay/approve/cancel) — both expose
 * the raw `status` + `body`.
 */
function isTxExpired(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { status, body } = err as { status?: unknown; body?: unknown };
  return (
    status === 409 &&
    typeof body === 'object' &&
    body !== null &&
    (body as { code?: unknown }).code === 'tx_expired'
  );
}

/**
 * The translated message for a `WalletError` (or a 409 `tx_expired` from a submit), or null for
 * anything else. The generic `mutationErrorMessage`/`vaultPayErrorMessage` helpers fall back to
 * `err.message`, which for a `WalletError` is its bare kind (`"sessionNotReady"`) — use this
 * first: `walletErrorMessage(t, err) ?? mutationErrorMessage(err, fallback)`.
 */
export function walletErrorMessage(t: TFunction, err: unknown): string | null {
  if (isTxExpired(err)) return t('That took too long in your wallet. Please try again.');
  if (!(err instanceof WalletError)) return null;
  return t(walletErrorMessageKey(err), { 0: err.reason ?? '' });
}
