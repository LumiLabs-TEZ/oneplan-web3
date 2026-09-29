/**
 * Pure day-grouping + row mapping for `VaultHistoryView` — port of the private `days`/`map`/
 * `dayTotalLabel`/`defaultTitle` helpers in `VaultHistoryView.swift` (`origin/feat/web3-version`).
 */
import { categoryOption } from '@/features/expense/categories';
import { CurrencyFormatter } from '@/lib/currency';

import type { VaultHistoryEntryDto } from '../api/queries';
import type { VaultHistoryEntry, VaultHistoryPerson } from '../components/VaultHistoryRow';

export interface VaultHistoryDay {
  /** `yyyy-MM-dd`, local calendar date. */
  key: string;
  /** `Today` or `dd/MM/yyyy` — no "Yesterday" case, unlike the classic trip history tab. */
  title: string;
  entries: VaultHistoryEntryDto[];
}

function parseCreatedAt(iso: string): Date {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayTitle(date: Date, now: Date, todayLabel: string): string {
  if (sameLocalDay(date, now)) return todayLabel;
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/**
 * Groups consecutive same-day entries into one card per day, newest first — mirrors Swift's
 * single forward pass. The server already returns newest-first, so relying on a single pass
 * (rather than re-bucketing + re-sorting) is intentional, not an oversight: sorting again would
 * only risk disagreeing with the server's own order.
 */
export function groupHistoryByDay(
  entries: readonly VaultHistoryEntryDto[],
  now: Date,
  todayLabel: string,
): VaultHistoryDay[] {
  const days: VaultHistoryDay[] = [];
  for (const entry of entries) {
    const date = parseCreatedAt(entry.createdAt);
    const key = dayKey(date);
    const last = days[days.length - 1];
    if (last && last.key === key) {
      last.entries.push(entry);
    } else {
      days.push({ key, title: dayTitle(date, now, todayLabel), entries: [entry] });
    }
  }
  return days;
}

/**
 * Day header total in the dominant unit (VND spends, else net USDC) — never sums VND and USDC
 * together. `null` when the day has neither (shouldn't happen for a non-empty day, but a day of
 * all-zero entries is possible in principle).
 */
export function dayTotalLabel(entries: readonly VaultHistoryEntryDto[]): string | null {
  let spendVnd = 0;
  let netUsdc = 0;
  let hasVnd = false;
  for (const entry of entries) {
    const usdc = Number(entry.amountMicro) / 1_000_000;
    const isIncoming = entry.kind === 'DEPOSIT' || entry.kind === 'SETTLEMENT';
    if (isIncoming) {
      netUsdc += usdc;
    } else if (entry.amountVnd != null && entry.amountVnd !== '') {
      spendVnd += Number(entry.amountVnd);
      hasVnd = true;
    } else {
      netUsdc -= usdc;
    }
  }
  if (hasVnd && spendVnd > 0) return `-${CurrencyFormatter.formatWhole(spendVnd)}đ`;
  if (netUsdc !== 0) {
    const sign = netUsdc > 0 ? '+' : '-';
    return `${sign}${CurrencyFormatter.formatUsdc(Math.abs(netUsdc))}`;
  }
  return null;
}

function defaultTitle(kind: string, t: (key: string) => string): string {
  switch (kind) {
    case 'DEPOSIT':
      return t('Deposit USDC');
    case 'SETTLEMENT':
      return t('Settlement');
    case 'REVERT':
      return t('Refund');
    default:
      return t('Payment');
  }
}

function person(
  member: { displayName: string; avatarUrl?: string | null } | null | undefined,
): VaultHistoryPerson | null {
  if (!member) return null;
  return { name: member.displayName, avatarUrl: member.avatarUrl ?? null };
}

function formatTime(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Row-type mapping — port of `VaultHistoryView.map(_:)`. */
export function mapHistoryEntry(
  entry: VaultHistoryEntryDto,
  t: (key: string) => string,
): VaultHistoryEntry {
  const usdc = Number(entry.amountMicro) / 1_000_000;
  const vnd = entry.amountVnd != null && entry.amountVnd !== '' ? Number(entry.amountVnd) : null;
  const isDeposit = entry.kind === 'DEPOSIT';
  const isSettlement = entry.kind === 'SETTLEMENT';
  const isIncoming = isDeposit || isSettlement;
  const category = categoryOption(entry.category).value;
  // A payment is shown in dong (what the merchant was handed); a deposit has no dong side.
  const amount = isIncoming ? usdc : (vnd ?? usdc);

  return {
    id: entry.id,
    title: entry.title ?? defaultTitle(entry.kind, t),
    category,
    kind: isDeposit
      ? { type: 'deposit', fromAddress: entry.fromAddress ?? '' }
      : isSettlement
        ? { type: 'settlement', toName: entry.recipient?.displayName ?? '' }
        : {
            type: 'expense',
            paidBy: person(entry.paidBy),
            shareWith: entry.shareWith.map((m) => ({
              name: m.displayName,
              avatarUrl: m.avatarUrl ?? null,
            })),
          },
    // Money in is positive, money out negative.
    amount: isIncoming ? amount : -amount,
    currency: isIncoming ? 'USD' : vnd != null ? 'VND' : 'USD',
    time: formatTime(parseCreatedAt(entry.createdAt)),
    // A spend still PENDING has not left the vault; a pending deposit is money already sent.
    isAwaitingApproval: entry.needsApproval,
  };
}
