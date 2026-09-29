/**
 * Edit-budget seeding + dirty-diff PATCH body — port of
 * `ios/OnePlan/OnePlan/View/Budget/EditBudgetView.swift` (`init` seeding at 30-121, `saveBudget`
 * at 467-531). Untouched money/contributor fields are omitted so the server preserves the stored
 * conversion and payment rows (see `tripCurrencyRules.ts` for the rationale). Budgets have no
 * category/date editing in this screen.
 */
import type { components } from '@/api/schema';
import {
  displayCurrencies,
  editAmountPayload,
  changedMemberIds,
} from '@/features/trip/helpers/tripCurrencyRules';
import {
  applyLiveFormatting,
  type Currency,
  currencyEquals,
  currencyFromCode,
  fallbackCurrency,
  formatWhole,
  parse,
} from '@/lib/currency';

import type { BudgetContributors } from './budgetFormReducer';

type BudgetDto = components['schemas']['BudgetDto'];
type TripDto = components['schemas']['TripDto'];
type UpdateBudgetDto = components['schemas']['UpdateBudgetDto'];

export interface EditBudgetDraft {
  name: string;
  /** Live-formatted amount text (what the field shows). */
  amountText: string;
  currency: Currency;
  contributors: BudgetContributors;
}

export interface EditBudgetBaseline {
  /** Parsed from the seeded text — same pipeline as the field — so rounding is not "dirty". */
  amount: number;
  currency: Currency;
  contributorIds: ReadonlySet<number>;
}

export interface EditBudgetSeed extends EditBudgetDraft {
  baseline: EditBudgetBaseline;
}

function acceptedMemberIds(trip: TripDto): number[] {
  return trip.members.filter((m) => m.inviteStatus === 'ACCEPTED').map((m) => m.userId);
}

export function seedEditBudget(
  budget: BudgetDto,
  trip: TripDto,
  acceptedIds: readonly number[],
): EditBudgetSeed {
  const homeCurrency = fallbackCurrency(trip.currency);
  const currency = currencyFromCode(budget.originalCurrency) ?? homeCurrency;
  const initialAmount = budget.originalAmount ?? budget.amount;

  const locals = (trip.localCurrencies ?? [])
    .map((c) => currencyFromCode(c))
    .filter((c): c is Currency => Boolean(c));
  let choices = displayCurrencies(homeCurrency, locals);
  if (!choices.some((c) => c.code === currency.code)) choices = [...choices, currency];

  // Dual-currency mode seeds decimal-aware text; the legacy single-currency path seeds a
  // whole-number string, even for a currency that otherwise has decimal places.
  const isDualMode = choices.length >= 2;
  const places = isDualMode ? currency.decimalPlaces : 0;
  const rawSeed =
    isDualMode && places > 0 ? initialAmount.toFixed(places) : formatWhole(initialAmount);
  const amountText = applyLiveFormatting(rawSeed, places);
  const amount = parse(amountText, places);

  const paymentUserIds = new Set(budget.payments.map((p) => p.userId));
  const accepted = new Set(acceptedIds);
  let contributors: BudgetContributors;
  if (accepted.size === 0) {
    contributors = { ids: [...paymentUserIds] };
  } else if (
    paymentUserIds.size >= accepted.size ||
    [...accepted].every((id) => paymentUserIds.has(id))
  ) {
    contributors = 'all';
  } else {
    contributors = { ids: [...paymentUserIds].filter((id) => accepted.has(id)) };
  }

  return {
    name: budget.name,
    amountText,
    currency,
    contributors,
    baseline: { amount, currency, contributorIds: paymentUserIds },
  };
}

function sameContributors(a: BudgetContributors, b: BudgetContributors): boolean {
  if (a === 'all' || b === 'all') return a === b;
  if (a.ids.length !== b.ids.length) return false;
  const bSet = new Set(b.ids);
  return a.ids.every((id) => bSet.has(id));
}

export function isBudgetDirty(seed: EditBudgetSeed, draft: EditBudgetDraft): boolean {
  const currentAmount = parse(draft.amountText, draft.currency.decimalPlaces);
  return (
    draft.name.trim() !== seed.name.trim() ||
    currentAmount !== seed.baseline.amount ||
    !currencyEquals(draft.currency, seed.baseline.currency) ||
    !sameContributors(draft.contributors, seed.contributors)
  );
}

/**
 * PATCH body. Name is always sent (as iOS does); amount + original pair and contributor
 * `userIds` are sent only when changed. Returns `null` when nothing changed at all.
 */
export function buildUpdateBudgetBody(
  seed: EditBudgetSeed,
  draft: EditBudgetDraft,
  trip: TripDto,
): UpdateBudgetDto | null {
  if (!isBudgetDirty(seed, draft)) return null;

  const homeCurrency = fallbackCurrency(trip.currency);
  const currentAmount = parse(draft.amountText, draft.currency.decimalPlaces);
  const amountPayload = editAmountPayload({
    baselineAmount: seed.baseline.amount,
    baselineCurrency: seed.baseline.currency,
    currentAmount,
    currentCurrency: draft.currency,
    homeCurrency,
  });

  const accepted = acceptedMemberIds(trip);
  const currentIds =
    draft.contributors === 'all'
      ? accepted
      : accepted.filter((id) => (draft.contributors as { ids: number[] }).ids.includes(id));
  const userIds = changedMemberIds(seed.baseline.contributorIds, currentIds);

  const body: UpdateBudgetDto = { name: draft.name.trim() };
  if (amountPayload.amount !== undefined) body.amount = amountPayload.amount;
  if (amountPayload.originalAmount !== undefined && amountPayload.originalCurrency) {
    body.originalAmount = amountPayload.originalAmount;
    body.originalCurrency = amountPayload.originalCurrency
      .code as UpdateBudgetDto['originalCurrency'];
  }
  if (userIds) body.userIds = userIds;
  return body;
}
