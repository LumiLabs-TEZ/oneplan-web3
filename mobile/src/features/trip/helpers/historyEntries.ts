/**
 * Pure history grouping for the trip History tab.
 *
 * Port of `Services/TripDetailService.swift` (`groupedHistory`, `mapExpenseToEntry`,
 * `mapBudgetToEntry`, `formatDateLabel`) — see `TripHistoryList.swift` for the
 * row model this feeds.
 */
import type { components } from '@/api/schema';
import {
  type Currency as CatalogCurrency,
  currencyFromCode,
  fallbackCurrency,
  formatDecimal,
  formatWhole,
} from '@/lib/currency';
import type { TranslateFn } from '@/ui/relativeTime';

type ExpenseSummaryDto = components['schemas']['ExpenseSummaryDto'];
type BudgetDto = components['schemas']['BudgetDto'];
type TripMemberDto = components['schemas']['TripMemberDto'];
type Currency = components['schemas']['Currency'];
type ExpenseCategory = components['schemas']['ExpenseCategory'];

export type HistoryLocale = 'en' | 'vi';

export type HistoryScope =
  { type: 'all' } | { type: 'members'; avatars: { userId: number; avatarUrl: string | null }[] };

export type HistoryPayer =
  { type: 'group' } | { type: 'member'; displayName: string; avatarUrl: string | null };

export interface HistoryEntry {
  kind: 'expense' | 'budget';
  id: number;
  name: string;
  category?: ExpenseCategory;
  /** `-1,955,000đ` for expenses, `+19,000,000đ` for budgets (0 fraction digits). */
  amountLabel: string;
  /** `amountLabel` as numbers for the animated row: unsigned amount, its sign and home currency. */
  amount: number;
  amountSign: '+' | '-';
  amountCurrency: CatalogCurrency;
  /** `~123.45 USD` — original (non-home) currency; budgets only today. */
  fxLabel?: string;
  /** `fxLabel` as numbers: the original amount and its currency (drawn `~{amount} {code}`). */
  fx?: { amount: number; currency: CatalogCurrency };
  scope: HistoryScope;
  /** `null` for budget rows (iOS shows no "paid by" pill there). */
  payer: HistoryPayer | null;
  /** ISO timestamp used for ordering within a day. */
  sortDate: string;
  /** `yyyy-MM-dd` — first 10 chars of the wire timestamp. */
  dateKey: string;
}

export interface HistorySection {
  dateKey: string;
  label: string;
  entries: HistoryEntry[];
}

export interface BuildHistorySectionsInput {
  expenses: ExpenseSummaryDto[];
  budgets: BudgetDto[];
  members: TripMemberDto[];
  currency: Currency;
  now: Date;
  t: TranslateFn;
  locale: HistoryLocale;
}

const DATE_KEY_LENGTH = 10;

/**
 * Grouped amount in the trip's home currency: whole for 0-decimal currencies (`1955000.4` VND →
 * `1,955,000`, iOS `formatCurrency`), cents otherwise (`1.89` USD → `1.89`) so a small spend in a
 * cents currency does not read as `1`.
 */
function homeAmount(amount: number, currency: CatalogCurrency): string {
  if (currency.decimalPlaces === 0) return formatWhole(amount);
  const rounded = Math.round(amount * 100) / 100;
  return `${formatWhole(rounded)}${formatDecimal(rounded)}`;
}

function timestampMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

function scopeFor(
  participants: readonly { userId: number; avatarUrl?: string | null }[],
  memberCount: number,
): HistoryScope {
  if (memberCount > 0 && participants.length >= memberCount) return { type: 'all' };
  return {
    type: 'members',
    avatars: participants.map((p) => ({ userId: p.userId, avatarUrl: p.avatarUrl ?? null })),
  };
}

export function mapExpenseToEntry(
  expense: ExpenseSummaryDto,
  memberCount: number,
  homeCurrency: CatalogCurrency,
): HistoryEntry {
  // A null payer (userId null) means the shared group wallet paid.
  const paidBy = expense.paidBy;
  const payer: HistoryPayer =
    paidBy == null || paidBy.userId == null
      ? { type: 'group' }
      : { type: 'member', displayName: paidBy.displayName, avatarUrl: paidBy.avatarUrl ?? null };

  return {
    kind: 'expense',
    id: expense.id,
    name: expense.name,
    category: expense.category,
    amountLabel: `-${homeAmount(expense.amount, homeCurrency)}${homeCurrency.symbol}`,
    amount: expense.amount,
    amountSign: '-',
    amountCurrency: homeCurrency,
    // `ExpenseSummaryDto` carries no originalAmount/originalCurrency, so no fxLabel here.
    scope: scopeFor(expense.sharedMembers, memberCount),
    payer,
    // History reflects the editable expense date, not creation time.
    sortDate: expense.expenseDate,
    dateKey: expense.expenseDate.slice(0, DATE_KEY_LENGTH),
  };
}

export function mapBudgetToEntry(
  budget: BudgetDto,
  memberCount: number,
  homeCurrency: CatalogCurrency,
): HistoryEntry {
  // iOS sums the per-member payments rather than reading `budget.amount`.
  const total = budget.payments.reduce((sum, p) => sum + p.amount, 0);

  let fxLabel: string | undefined;
  let fx: HistoryEntry['fx'];
  const original = currencyFromCode(budget.originalCurrency);
  if (original && budget.originalAmount != null && original.code !== homeCurrency.code) {
    const decimal = original.decimalPlaces > 0 ? formatDecimal(budget.originalAmount) : '';
    fxLabel = `~${formatWhole(budget.originalAmount)}${decimal} ${original.code}`;
    fx = { amount: budget.originalAmount, currency: original };
  }

  return {
    kind: 'budget',
    id: budget.id,
    name: budget.name,
    category: budget.category,
    amountLabel: `+${homeAmount(total, homeCurrency)}${homeCurrency.symbol}`,
    amount: total,
    amountSign: '+',
    amountCurrency: homeCurrency,
    fxLabel,
    fx,
    scope: scopeFor(budget.payments, memberCount),
    payer: null,
    sortDate: budget.createdAt,
    dateKey: budget.createdAt.slice(0, DATE_KEY_LENGTH),
  };
}

/** Parse `yyyy-MM-dd` as a *local* calendar date (iOS `DateFormatter` default zone). */
function parseDateKey(dateKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const EN_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * Section header: `Today` / `Yesterday` / `MMM d` (`TripDetailService.formatDateLabel`).
 * Unparseable keys are returned verbatim.
 */
export function formatDateLabel(
  dateKey: string,
  now: Date,
  t: TranslateFn,
  locale: HistoryLocale,
): string {
  const date = parseDateKey(dateKey);
  if (!date) return dateKey;

  if (sameLocalDay(date, now)) return t('Today');
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameLocalDay(date, yesterday)) return t('Yesterday');

  const Ctor = (globalThis.Intl as Partial<typeof Intl> | undefined)?.DateTimeFormat;
  if (typeof Ctor === 'function') {
    try {
      return new Ctor(locale, { month: 'short', day: 'numeric' }).format(date);
    } catch {
      // fall through to the English fallback
    }
  }
  return `${EN_MONTHS[date.getMonth()] ?? ''} ${date.getDate()}`;
}

/**
 * Expenses + budgets grouped by day (desc), entries within a day desc by timestamp.
 * Only ACCEPTED members count toward the "All" scope threshold.
 */
export function buildHistorySections(input: BuildHistorySectionsInput): HistorySection[] {
  const { expenses, budgets, members, currency, now, t, locale } = input;
  const memberCount = members.filter((m) => m.inviteStatus === 'ACCEPTED').length;
  const home = fallbackCurrency(currency);

  const entries: HistoryEntry[] = [
    ...expenses.map((e) => mapExpenseToEntry(e, memberCount, home)),
    ...budgets.map((b) => mapBudgetToEntry(b, memberCount, home)),
  ];

  const byDate = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const bucket = byDate.get(entry.dateKey);
    if (bucket) bucket.push(entry);
    else byDate.set(entry.dateKey, [entry]);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([dateKey, group]) => ({
      dateKey,
      label: formatDateLabel(dateKey, now, t, locale),
      entries: [...group].sort((a, b) => timestampMs(b.sortDate) - timestampMs(a.sortDate)),
    }));
}
