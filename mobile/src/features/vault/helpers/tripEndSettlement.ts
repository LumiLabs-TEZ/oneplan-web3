/**
 * View-model mapping for cash debts (`CashDebtDto`) — the client never computes who owes whom
 * (that's server `TripVaultSettlementService.preview`, `settlement-math.ts`); this only shapes the
 * already-computed debt into what `VaultSettlementRow` / the review ledger draw, plus the
 * indicative USD→VND conversion iOS applies for display
 * (`TripEndReviewView`/`VaultSettlementView`: fallback 26,500 until `ExchangeRateService` resolves).
 */
import type { CashDebtDto } from '@/features/vault/api/endTrip';

/** Structural — satisfied by both `TripEndVoteMemberDto` and `TripMemberDto`. */
interface MemberAvatarLookup {
  userId: number;
  avatarUrl?: string | null;
}

/** Fallback USD→VND rate used until the live exchange rate resolves — never authoritative pricing. */
export const FALLBACK_USDC_TO_VND = 26_500;

export type SettlementDirection = 'receiving' | 'paying';
export type SettlementRowState = 'outstanding' | 'markedDone';

export interface VaultSettlementEntryLine {
  title: string;
  /** VND-converted amount, at the indicative rate. */
  amount: number;
  amountUsdc: number;
}

export interface VaultSettlementEntryModel {
  /** The counterparty's user id. */
  id: number;
  name: string;
  avatarUrls: string[];
  extraCount: number;
  direction: SettlementDirection;
  /** VND-converted amount, at the indicative rate. */
  amount: number;
  amountUsdc: number;
  lines: VaultSettlementEntryLine[];
  state: SettlementRowState;
  /** Present only when paying and the creditor has linked a wallet — enables Send. */
  walletAddress: string | null;
  /** True only for the creditor (server-computed) — gates "Mark as done". */
  canConfirm: boolean;
}

/** micro-USDC decimal string -> USDC. Malformed input (never expected from the server) -> 0. */
export function microToUsdc(amountMicro: string): number {
  const n = Number(amountMicro);
  return Number.isFinite(n) ? n / 1_000_000 : 0;
}

export function mapCashDebtToEntry(
  debt: CashDebtDto,
  myUserId: number,
  usdcToVnd: number,
  counterpartAvatarUrl?: string | null,
): VaultSettlementEntryModel {
  const isReceiving = debt.toUserId === myUserId;
  const counterpartId = isReceiving ? debt.fromUserId : debt.toUserId;
  const counterpartName = isReceiving ? debt.fromDisplayName : debt.toDisplayName;
  const amountUsdc = microToUsdc(debt.amountMicro);
  const lines: VaultSettlementEntryLine[] = debt.lines.map((line) => {
    const lineUsdc = microToUsdc(line.amountMicro);
    return { title: line.title, amount: lineUsdc * usdcToVnd, amountUsdc: lineUsdc };
  });

  return {
    id: counterpartId,
    name: counterpartName,
    avatarUrls: counterpartAvatarUrl ? [counterpartAvatarUrl] : [],
    extraCount: 0,
    direction: isReceiving ? 'receiving' : 'paying',
    amount: amountUsdc * usdcToVnd,
    amountUsdc,
    lines,
    state: debt.isConfirmed ? 'markedDone' : 'outstanding',
    // Send only when the caller owes and the creditor has a wallet — receiving rows never send.
    walletAddress: isReceiving ? null : (debt.toWalletAddress ?? null),
    canConfirm: debt.canConfirm,
  };
}

export function avatarUrlFor(
  members: readonly MemberAvatarLookup[],
  userId: number,
): string | null {
  return members.find((m) => m.userId === userId)?.avatarUrl ?? null;
}

/**
 * Net USDC across a set of debts, signed from `myUserId`'s perspective (positive = owed to them).
 * Used for the Review screen's "Settlement" section total.
 */
export function settlementNetUsdc(debts: readonly CashDebtDto[], myUserId: number): number {
  return debts.reduce((sum, debt) => {
    const usdc = microToUsdc(debt.amountMicro);
    return sum + (debt.toUserId === myUserId ? usdc : -usdc);
  }, 0);
}
