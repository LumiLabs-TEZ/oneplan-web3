/**
 * Pure day-grouping + row mapping for `VaultHistoryView` — port of the private `days`/`map`/
 * `dayTotalLabel`/`defaultTitle` helpers in `VaultHistoryView.swift` (`origin/feat/web3-version`).
 */
import { categoryOption } from '@/features/expense/categories';
import { CurrencyFormatter } from '@/lib/currency';

import type { VaultHistoryEntryDto } from '../api/queries';
import type { VaultHistoryEntry, VaultHistoryPerson } from '../components/VaultHistoryRow';
import type { VaultDepositFlow } from '../vaultDepositFlowStore';

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
 * Day header total: the day's net USDC change for the vault (money in +, spends −). Every entry
 * carries `amountMicro` — a spend's is the USDC actually debited — so the sum is single-unit and
 * deposits are never dropped. `null` when the day nets to zero.
 */
export function dayTotalLabel(entries: readonly VaultHistoryEntryDto[]): string | null {
  let netMicro = 0;
  for (const entry of entries) {
    const micro = Number(entry.amountMicro);
    const isIncoming = entry.kind === 'DEPOSIT' || entry.kind === 'SETTLEMENT';
    netMicro += isIncoming ? micro : -micro;
  }
  if (netMicro === 0) return null;
  const sign = netMicro > 0 ? '+' : '-';
  return `${sign}$${CurrencyFormatter.formatUsdc(Math.abs(netMicro) / 1_000_000)}`;
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
    // Always the vault's own unit (USDC) so rows add up to the balance; money in +, out −.
    amount: isIncoming ? usdc : -usdc,
    currency: 'USD',
    // A payment also shows the dong the merchant was handed; a deposit has no dong side.
    secondaryVnd: isIncoming ? null : vnd,
    time: formatTime(parseCreatedAt(entry.createdAt)),
    // A spend still PENDING has not left the vault; a pending deposit is money already sent.
    isAwaitingApproval: entry.needsApproval,
  };
}

/** Rows that open a full-screen receipt — a payment (bank details) or a deposit (tx id). */
export function hasHistoryDetail(entry: VaultHistoryEntryDto): boolean {
  return entry.kind === 'SPEND' || entry.kind === 'DEPOSIT';
}

/** A past deposit as the `VaultDepositResultScreen` receipt; the address is the sender's wallet. */
export function depositFlowFromHistory(entry: VaultHistoryEntryDto): VaultDepositFlow {
  return {
    amountMicro: BigInt(entry.amountMicro),
    recipient: entry.fromAddress ?? '',
    status: entry.status === 'CONFIRMED' ? 'completed' : 'processing',
    signature: entry.signature ?? '',
    date: parseCreatedAt(entry.createdAt).getTime(),
  };
}
