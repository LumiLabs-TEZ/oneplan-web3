/**
 * View-model mapping for the Review screen's ledger — port of
 * `TripEndReviewView.mapHistory`/`historyEntries`/`historyTotal`/`historyCurrency`.
 *
 * `VaultHistoryEntryDto` mixes two units by kind: deposits/settlements move USDC (`amountMicro`),
 * spends carry a VND face value (`amountVnd`) alongside the USDC actually debited. iOS's ledger
 * caption sums every entry's `amount` field regardless of which of those two units it holds, then
 * labels the sum with whichever currency the first non-USD entry used — a known quirk of the
 * source screen (not real cross-currency arithmetic), ported here as-is rather than "fixed",
 * since the entries in practice are dominated by the VND spends and the USD deposit/settlement
 * figures are visually negligible against them.
 */
import { formatTime } from '@/features/trip/components/TripHistoryList';
import type { VaultHistoryEntryDto } from '@/features/vault/api/queries';
import type { ExpenseCategory } from '@/features/expense/categories';

import { microToUsdc } from './tripEndSettlement';

export type ReviewHistoryKind = 'deposit' | 'settlement' | 'expense';
export type ReviewHistoryCurrency = 'USD' | 'VND';

export interface ReviewHistoryEntry {
  id: number;
  kind: ReviewHistoryKind;
  /** Raw title from the server; `null` means the caller should show the kind's fallback label. */
  title: string | null;
  category: ExpenseCategory | null;
  paidByName: string | null;
  fromAddress: string | null;
  recipientName: string | null;
  /** Signed: positive for money coming back to the group (deposit/settlement), negative for a spend. */
  amount: number;
  currency: ReviewHistoryCurrency;
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
  const magnitude = isIncoming ? usdc : (vnd ?? usdc);
  const currency: ReviewHistoryCurrency = isIncoming ? 'USD' : vnd != null ? 'VND' : 'USD';

  return {
    id: entry.id,
    kind: isDeposit ? 'deposit' : isSettlement ? 'settlement' : 'expense',
    title: entry.title ?? null,
    category: (entry.category as ExpenseCategory | null) ?? null,
    paidByName: entry.paidBy?.displayName ?? null,
    fromAddress: entry.fromAddress ?? null,
    recipientName: entry.recipient?.displayName ?? null,
    amount: isIncoming ? magnitude : -magnitude,
    currency,
    time: formatTime(entry.createdAt, undefined, uses24hourClock),
    isAwaitingApproval: entry.needsApproval,
  };
}

/** First non-USD entry's currency, falling back to VND — mirrors `TripEndReviewView.historyCurrency`. */
export function historyCurrencyOf(entries: readonly ReviewHistoryEntry[]): ReviewHistoryCurrency {
  return entries.find((e) => e.currency !== 'USD')?.currency ?? entries[0]?.currency ?? 'VND';
}

export function historyTotalOf(entries: readonly ReviewHistoryEntry[]): number {
  return entries.reduce((sum, e) => sum + e.amount, 0);
}
