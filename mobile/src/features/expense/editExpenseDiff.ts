/**
 * Edit-expense seeding + dirty-diff PATCH body — port of
 * `ios/OnePlan/OnePlan/View/Expense/EditExpenseView.swift` (`init` seeding at 61-121, save at
 * 620-665). Untouched money/split/payer fields are omitted so the server preserves the stored
 * conversion and share split (see `tripCurrencyRules.ts` for the rationale).
 */
import type { components } from '@/api/schema';
import { changedMemberIds, editAmountPayload } from '@/features/trip/helpers/tripCurrencyRules';
import {
  applyLiveFormatting,
  type Currency,
  currencyEquals,
  currencyFromCode,
  parse,
} from '@/lib/currency';

import type { ExpenseCategory } from './categories';
import {
  acceptedMemberIds,
  type PaidBy,
  type ShareMode,
  shareMemberIds,
} from './detailsFormReducer';

type ExpenseDto = components['schemas']['ExpenseDto'];
type UpdateExpenseDto = components['schemas']['UpdateExpenseDto'];
type TripMemberDto = components['schemas']['TripMemberDto'];

export interface EditExpenseDraft {
  name: string;
  category: ExpenseCategory;
  /** Live-formatted amount text (what the field shows). */
  amountText: string;
  currency: Currency;
  /** Full ISO timestamp of the expense date/time. */
  expenseDate: string;
  shareMode: ShareMode;
  paidBy: PaidBy;
}

export interface EditExpenseBaseline {
  draft: EditExpenseDraft;
  /** Parsed from the seeded text — same pipeline as the field — so rounding is not "dirty". */
  amount: number;
  currency: Currency;
  shareUserIds: ReadonlySet<number>;
  paidBy: PaidBy;
}

/** Plain full-precision string ("1234.56" / "1234") the way the Swift seed builds it. */
export function plainAmountText(amount: number, decimalPlaces: number): string {
  return amount.toFixed(Math.max(0, decimalPlaces));
}

export function seedEditExpense(
  expense: ExpenseDto,
  members: readonly TripMemberDto[],
  homeCurrency: Currency,
): EditExpenseBaseline {
  const currency = currencyFromCode(expense.originalCurrency) ?? homeCurrency;
  const initialAmount = expense.originalAmount ?? expense.amount;
  const amountText = applyLiveFormatting(
    plainAmountText(initialAmount, currency.decimalPlaces),
    currency.decimalPlaces,
  );
  const amount = parse(amountText, currency.decimalPlaces);

  const payerId = expense.paidBy?.userId ?? null;
  const paidBy: PaidBy = payerId == null ? { type: 'group' } : { type: 'member', userId: payerId };

  const accepted = new Set(acceptedMemberIds(members));
  const shareIds = new Set(expense.shares.map((s) => s.userId));
  let shareMode: ShareMode;
  if (accepted.size === 0) {
    shareMode = { type: 'members', ids: [...shareIds] };
  } else if (shareIds.size >= accepted.size || [...accepted].every((id) => shareIds.has(id))) {
    shareMode = { type: 'all' };
  } else {
    shareMode = { type: 'members', ids: [...shareIds].filter((id) => accepted.has(id)) };
  }

  return {
    draft: {
      name: expense.name,
      category: expense.category,
      amountText,
      currency,
      expenseDate: expense.expenseDate,
      shareMode,
      paidBy,
    },
    amount,
    currency,
    shareUserIds: shareIds,
    paidBy,
  };
}

function samePaidBy(a: PaidBy, b: PaidBy): boolean {
  return a.type === b.type && (a.type === 'group' || a.userId === (b as typeof a).userId);
}

export interface BuildUpdateInput {
  baseline: EditExpenseBaseline;
  draft: EditExpenseDraft;
  members: readonly TripMemberDto[];
  homeCurrency: Currency;
  /** Existing note is re-sent unchanged (iOS passes `editingExpense.note`). */
  note: string | null | undefined;
}

export function isEditDirty(baseline: EditExpenseBaseline, draft: EditExpenseDraft): boolean {
  const b = baseline.draft;
  const currentAmount = parse(draft.amountText, draft.currency.decimalPlaces);
  return (
    draft.name.trim() !== b.name.trim() ||
    draft.category !== b.category ||
    draft.expenseDate !== b.expenseDate ||
    currentAmount !== baseline.amount ||
    !currencyEquals(draft.currency, baseline.currency) ||
    !samePaidBy(draft.paidBy, baseline.paidBy) ||
    JSON.stringify(draft.shareMode) !== JSON.stringify(b.shareMode)
  );
}

/**
 * PATCH body. Name/category/date/note are always sent (as iOS does); amount + original pair,
 * memberIds and payer are sent only when changed. Returns `null` when nothing changed at all.
 */
export function buildUpdateBody({
  baseline,
  draft,
  members,
  homeCurrency,
  note,
}: BuildUpdateInput): UpdateExpenseDto | null {
  if (!isEditDirty(baseline, draft)) return null;

  const currentAmount = parse(draft.amountText, draft.currency.decimalPlaces);
  const amountPayload = editAmountPayload({
    baselineAmount: baseline.amount,
    baselineCurrency: baseline.currency,
    currentAmount,
    currentCurrency: draft.currency,
    homeCurrency,
  });
  const memberIds = changedMemberIds(
    baseline.shareUserIds,
    shareMemberIds(draft.shareMode, acceptedMemberIds(members)),
  );

  const body: UpdateExpenseDto = {
    name: draft.name.trim(),
    category: draft.category,
    expenseDate: draft.expenseDate,
  };
  if (note != null) body.note = note;
  if (amountPayload.amount !== undefined) body.amount = amountPayload.amount;
  if (amountPayload.originalAmount !== undefined && amountPayload.originalCurrency) {
    body.originalAmount = amountPayload.originalAmount;
    body.originalCurrency = amountPayload.originalCurrency
      .code as UpdateExpenseDto['originalCurrency'];
  }
  if (memberIds) body.memberIds = memberIds;
  if (!samePaidBy(draft.paidBy, baseline.paidBy)) {
    if (draft.paidBy.type === 'member') {
      body.paidById = draft.paidBy.userId;
      body.paidByGroup = false;
    } else {
      body.paidByGroup = true;
    }
  }
  return body;
}
