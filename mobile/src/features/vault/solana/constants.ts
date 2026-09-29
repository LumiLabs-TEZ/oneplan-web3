/**
 * On-chain constants for the vault program, ported from
 * `ios/OnePlan/OnePlan/Services/TripVaultService.swift` (branch
 * `feat/web3-version`, lines ~115-134).
 *
 * Deliberately hard-coded rather than fetched from the server: they are what
 * the client checks the server's transactions against
 * (`transactionVerifier.verify`), so taking them from the server would make
 * the check circular.
 *
 * Every discriminator here was copied from `solana/target/idl/oneplan_vault.json`
 * and cross-checked against `server/src/solana/idl/oneplan_vault.json` on the
 * same branch. An Anchor discriminator is `sha256("global:<instruction>")`
 * truncated to eight bytes, so these are reproducible rather than magic.
 *
 * --- After a redeploy ---
 * The program will be redeployed under a new program id, and a security audit
 * may change account layouts. When that lands:
 *   1. Update `VAULT_PROGRAM_ID` from the new IDL's `address` field.
 *   2. Re-copy every discriminator below from the new IDL's `instructions[].discriminator`
 *      — do NOT hand-derive them (a typo here would silently disable the check
 *      it exists to perform).
 */

/** Devnet deployment. See `solana/DEPLOY.md` on `feat/web3-version`. */
export const VAULT_PROGRAM_ID = 'HcBimMiXCgDnBabhsyoq99g1WqzNSEuiiNMoUvXrtLAL';

/**
 * Devnet USDC mint (`solana/DEPLOY.md`, `server/.env.example` `SOLANA_USDC_MINT`
 * on `feat/web3-version`). Intentional divergence from the Swift original:
 * `TransactionVerifier.verifyTokenTransfer` never checked this account. This
 * port does (see `transactionVerifier.ts`) — update alongside
 * `SOLANA_USDC_MINT` if the server ever points at a different mint (e.g. a
 * mainnet cutover).
 */
export const VAULT_USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

export const VAULT_DISCRIMINATORS = {
  deposit: [242, 35, 198, 137, 82, 225, 242, 182],
  spend: [242, 205, 255, 87, 101, 217, 245, 57],
  /** Above the trip's threshold the server builds these two instead of `spend`. */
  proposeSpend: [63, 66, 131, 224, 13, 141, 135, 81],
  approveSpend: [248, 201, 151, 15, 28, 162, 112, 90],
  /** Clears an open above-threshold spend without moving USDC. */
  cancelSpend: [122, 254, 101, 132, 241, 232, 205, 179],
} as const satisfies Record<string, readonly number[]>;

/**
 * VND-per-USDC sanity band for `../api/pay.ts`'s pre-sign amount check (security audit S-4/S-4b).
 *
 * `payVault` binds the signed amount to a `quoteVaultPayment` call made from the user's own typed
 * VND — but that quote, like `prepare`, still comes from the server, so a fully compromised server
 * could return a consistent-but-wrong pair (inflated quote + matching prepare) and the
 * quote-vs-prepare equality check alone would not catch it. This band is the last independent
 * check: it is derived from nothing the server sends, only from what a VND/USDC rate could
 * plausibly be, so an amount outside it is rejected before signing regardless of what the server
 * claims.
 *
 * The real rate at the time this was written is ~26,500 (mocked — see `docs/web3/server-port-
 * report.md`); 20,000–35,000 gives roughly ±25% headroom for FX drift and the provider fee, while
 * still catching an order-of-magnitude manipulation (e.g. a 10x inflated spend). MUST be revisited
 * once live FX lands — a real VND/USDC rate could plausibly move outside this band over time, in
 * which case this becomes either too tight (rejects legitimate payments) or too loose (stops
 * catching realistic manipulation); pull live min/max from the same source the server uses instead
 * of hand-picked constants.
 */
export const FX_VND_PER_USDC_MIN = 20_000;
export const FX_VND_PER_USDC_MAX = 35_000;
