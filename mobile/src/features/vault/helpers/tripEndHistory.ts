/**
 * View-model mapping for the Review screen's ledger — port of
 * `TripEndReviewView.mapHistory`/`historyEntries`/`historyTotal`.
 *
 * Every row is in USDC, the vault's own unit: deposits/settlements move `amountMicro`, and a
 * spend's `amountMicro` is the USDC actually debited. A spend's VND face value (`amountVnd`) rides
 * along as `secondaryVnd` for display only, so the ledger total is single-unit arithmetic (iOS
 * summed VND and USDC together).
 */
import { formatTime } from '@/features/trip/components/TripHistoryList';
import type { VaultHistoryEntryDto } from '@/features/vault/api/queries';
import type { ExpenseCategory } from '@/features/expense/categories';

import { microToUsdc } from './tripEndSettlement';

export type ReviewHistoryKind = 'deposit' | 'settlement' | 'expense';

export interface ReviewHistoryEntry {
  id: number;
  kind: ReviewHistoryKind;
  /** Raw title from the server; `null` means the caller should show the kind's fallback label. */
  title: string | null;
  category: ExpenseCategory | null;
  paidByName: string | null;
  fromAddress: string | null;
  recipientName: string | null;
  /** Signed USDC: positive for money coming back to the group (deposit/settlement), negative for a spend. */
  amount: number;
  /** Dong the merchant was handed (spends only). */
  secondaryVnd: number | null;
  time: string;
  isAwaitingApproval: boolean;
}

export function mapHistoryEntry(
  entry: VaultHistoryEntryDto,
  uses24hourClock: boolean | null | undefined,
): ReviewHistoryEntry {
  const usdc = microToUsdc(entry.amountMicro);
  const vnd = entry.amountVnd != null ? Number(entry.amountVnd) : null;
  const isDeposit = entry.kind === 'DEPOSIT';
  const isSettlement = entry.kind === 'SETTLEMENT';
  const isIncoming = isDeposit || isSettlement;

  return {
    id: entry.id,
    kind: isDeposit ? 'deposit' : isSettlement ? 'settlement' : 'expense',
    title: entry.title ?? null,
    category: (entry.category as ExpenseCategory | null) ?? null,
    paidByName: entry.paidBy?.displayName ?? null,
    fromAddress: entry.fromAddress ?? null,
    recipientName: entry.recipient?.displayName ?? null,
    amount: isIncoming ? usdc : -usdc,
    secondaryVnd: isIncoming ? null : vnd,
    time: formatTime(entry.createdAt, undefined, uses24hourClock),
    isAwaitingApproval: entry.needsApproval,
  };
}

export function historyTotalOf(entries: readonly ReviewHistoryEntry[]): number {
  return entries.reduce((sum, e) => sum + e.amount, 0);
}
