/**
 * Pure view model for the expense detail screen — port of the computed properties in
 * `ios/OnePlan/OnePlan/View/Expense/ExpenseDetailView.swift` (`expensePercent`, `formattedTime`,
 * `shareLabel`, `currentUserShare`, `heroAmountRow`, `originalAmountSubtext`) and the
 * "Your expense" row of `ExpenseDetailHistoryCard`.
 */
import type { components } from '@/api/schema';
import { type Currency, currencyFromCode, formatDecimal, formatWhole } from '@/lib/currency';

type ExpenseDto = components['schemas']['ExpenseDto'];
type BudgetDto = components['schemas']['BudgetDto'];

export type ExpenseScope = { type: 'all' } | { type: 'members'; count: number };
export type ExpensePayer =
  { type: 'group' } | { type: 'member'; displayName: string; avatarUrl: string | null };

export interface ExpenseHeroAmount {
  /** Home-currency symbol, drawn in the light colour. */
  symbol: string;
  /** `-1,955,000` — sign + grouped whole part. */
  whole: string;
  /** `.50` for 2-decimal currencies, `null` for 0-decimal ones. */
  decimal: string | null;
  /** The unsigned amount + currency the split strings are built from (animated hero). */
  amount: number;
  currency: Currency;
}

/** An amount in a non-home currency, drawn `~{amount} {code}`. */
export interface ExpenseOriginalAmount {
  amount: number;
  currency: Currency;
}

export interface ExpenseDetailModel {
  hero: ExpenseHeroAmount;
  /** `~123.45 USD` when the row was authored in a non-home currency, else `null`. */
  originalCaption: string | null;
  /** `originalCaption` as numbers; `null` exactly when the caption is. */
  original: ExpenseOriginalAmount | null;
  /** Signed-in user's share, or `null` when they are not part of the split. */
  myShare: number | null;
  /** `-1,955,000đ` (iOS: `-{whole}{symbol}`) — `null` when `myShare` is null. */
  myShareLabel: string | null;
  scope: ExpenseScope;
  /** `0…100` share of the trip's total budget; `null` when the trip has no budgets. */
  budgetPercent: number | null;
  payer: ExpensePayer;
}

export interface ExpenseDetailModelInput {
  expense: ExpenseDto;
  homeCurrency: Currency;
  budgets: readonly Pick<BudgetDto, 'amount'>[];
  /** Number of accepted trip members; the split is "All" when shares cover them all. */
  memberCount: number;
  /** Signed-in user id (`null` while the profile is loading). */
  meId: number | null | undefined;
}

export function heroAmount(amount: number, currency: Currency): ExpenseHeroAmount {
  return {
    symbol: currency.symbol,
    whole: `-${formatWhole(amount)}`,
    decimal: currency.decimalPlaces > 0 ? formatDecimal(amount) : null,
    amount,
    currency,
  };
}

/** The non-home original pair; `null` when missing or already the home currency. */
export function originalAmount(
  expense: Pick<ExpenseDto, 'originalAmount' | 'originalCurrency'>,
  homeCurrency: Currency,
): ExpenseOriginalAmount | null {
  const origCur = currencyFromCode(expense.originalCurrency);
  const origAmt = expense.originalAmount;
  if (!origCur || origAmt == null || origCur.code === homeCurrency.code) return null;
  return { amount: origAmt, currency: origCur };
}

/** `~1,234.50 USD`; `null` when there is no original pair or it is already the home currency. */
export function originalCaption(
  expense: Pick<ExpenseDto, 'originalAmount' | 'originalCurrency'>,
  homeCurrency: Currency,
): string | null {
  const original = originalAmount(expense, homeCurrency);
  if (!original) return null;
  const { amount, currency } = original;
  const decimal = currency.decimalPlaces > 0 ? formatDecimal(amount) : '';
  return `~${formatWhole(amount)}${decimal} ${currency.code}`;
}

export function expenseScope(shareCount: number, memberCount: number): ExpenseScope {
  if (memberCount > 0 && shareCount >= memberCount) return { type: 'all' };
  return { type: 'members', count: shareCount };
}

/** `min(floor(amount / total * 100), 100)`; `null` when there is nothing to compare against. */
export function budgetPercent(
  amount: number,
  budgets: readonly Pick<BudgetDto, 'amount'>[],
): number | null {
  if (budgets.length === 0) return null;
  const total = budgets.reduce((sum, b) => sum + b.amount, 0);
  if (!(total > 0)) return null;
  return Math.min(Math.trunc((amount / total) * 100), 100);
}

export function myShareAmount(
  shares: readonly { userId: number; shareAmount: number }[],
  meId: number | null | undefined,
): number | null {
  if (meId == null) return null;
  return shares.find((s) => s.userId === meId)?.shareAmount ?? null;
}

export function expensePayer(paidBy: ExpenseDto['paidBy']): ExpensePayer {
  if (!paidBy || paidBy.userId == null) return { type: 'group' };
  return { type: 'member', displayName: paidBy.displayName, avatarUrl: paidBy.avatarUrl ?? null };
}

export function buildExpenseDetailModel({
  expense,
  homeCurrency,
  budgets,
  memberCount,
  meId,
}: ExpenseDetailModelInput): ExpenseDetailModel {
  const myShare = myShareAmount(expense.shares, meId);
  return {
    hero: heroAmount(expense.amount, homeCurrency),
    originalCaption: originalCaption(expense, homeCurrency),
    original: originalAmount(expense, homeCurrency),
    myShare,
    myShareLabel: myShare == null ? null : `-${formatWhole(myShare)}${homeCurrency.symbol}`,
    scope: expenseScope(expense.shares.length, memberCount),
    budgetPercent: budgetPercent(expense.amount, budgets),
    payer: expensePayer(expense.paidBy),
  };
}

/**
 * `"3:30 PM - Jun 2, 2026"` (`DisplayFormatters.time` + `.date`, joined like the iOS
 * `"%1$@ - %2$@"` string). Unparseable input is returned verbatim.
 */
export function formatExpenseTime(
  iso: string,
  locale: string,
  timeZone?: string,
  uses24hourClock?: boolean,
): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const date = new Date(ms);
  const time = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: uses24hourClock == null ? undefined : !uses24hourClock,
    timeZone,
  });
  const day = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  });
  return `${time.format(date)} - ${day.format(date)}`;
}

/**
 * Edit-expense Time row — `EditExpenseView.formattedDateTime` (`EditExpenseView.swift:153-158`)
 * uses a fixed POSIX `HH:mm - dd/MM/yyyy` in local time (not the locale-aware detail format).
 * Unparseable input is returned verbatim.
 */
export function formatEditExpenseTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} - ${pad(d.getDate())}/${pad(
    d.getMonth() + 1,
  )}/${d.getFullYear()}`;
}
