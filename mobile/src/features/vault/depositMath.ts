/**
 * Port of the deposit-fee math from `ContributeToVaultView.swift` (`origin/feat/web3-version`) —
 * `microUSDC(from:)` and `grossDeposit(forNet:)`. Shared pure functions (not copy-pasted) because
 * `VaultLeaveBottomSheet` (Wave E) reuses `grossDeposit` for its locked leave-settle amount.
 */

/** Matches on-chain skim: 0.1% (10 bps). */
export const DEPOSIT_FEE_BPS = 10n;

/**
 * `"12.34"` → 12_340_000n micro. Caps fractional digits at 6 (USDC decimals) — Swift's own
 * comment: `"12.3456789"` keeps only the first 6 fraction digits.
 */
export function microUSDC(digits: string): bigint {
  if (digits === '') return 0n;
  const [wholeRaw, fracRaw] = digits.split('.', 2) as [string, string | undefined];
  const whole = wholeRaw === '' ? 0n : BigInt(wholeRaw);
  if (fracRaw === undefined) return whole * 1_000_000n;
  const fracDigits = fracRaw.slice(0, 6).padEnd(6, '0');
  return whole * 1_000_000n + BigInt(fracDigits);
}

/** Gross send so vault net after the 0.1% skim is at least `netMicro`. `ceil(net * 10000 / 9990)`. */
export function grossDeposit(netMicro: bigint): bigint {
  if (netMicro <= 0n) return 0n;
  const keepBps = 10_000n - DEPOSIT_FEE_BPS;
  return (netMicro * 10_000n + keepBps - 1n) / keepBps;
}

export function depositFeeMicro(amountMicro: bigint): bigint {
  return (amountMicro * DEPOSIT_FEE_BPS) / 10_000n;
}

export function depositNetMicro(amountMicro: bigint): bigint {
  return amountMicro - depositFeeMicro(amountMicro);
}

/** Trims trailing zeros/dot, e.g. `4.990000` → `4.99`, `5.000000` → `5`. */
export function formatMicroUsdc(micro: bigint): string {
  const whole = micro / 1_000_000n;
  const frac = micro % 1_000_000n;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(6, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}`;
}
