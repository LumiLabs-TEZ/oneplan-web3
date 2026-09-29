/**
 * `VaultTransaction.failureCode` values this server writes itself. Payout
 * providers add their own (e.g. MOCK_DECLINED); those always mean money left
 * the chain and a merchant was not paid.
 */
export const VAULT_FAILURE_CODES = {
  /** The reconcile job has already sent the on-chain transfer back. */
  reverted: 'REVERTED',
  /** An above-threshold proposal was withdrawn; no USDC ever moved. */
  cancelled: 'cancelled',
  /** The client never signed the transaction; nothing reached the chain. */
  abandoned: 'abandoned',
} as const;

/** Codes for which there is nothing on chain to undo. */
export const FAILURE_CODES_WITHOUT_TRANSFER: string[] = [
  VAULT_FAILURE_CODES.reverted,
  VAULT_FAILURE_CODES.cancelled,
  VAULT_FAILURE_CODES.abandoned,
];
