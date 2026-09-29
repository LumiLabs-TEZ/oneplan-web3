/**
 * Add-budget details form — port of the state in
 * `ios/OnePlan/OnePlan/View/Budget/AddBudgetDetailsSheet.swift` (`toggleContributor`,
 * `contributorIdsToSave`, `canSubmit`, `projectedBalance`) and the payload mapping in
 * `AddBudgetView` / `TripDetailView.submitBudget`. Budgets have no category/share-mode
 * choice — every contributor is charged the FULL entered amount, not a split.
 */
import type { components } from '@/api/schema';
import { displayCurrencies, originalPayload } from '@/features/trip/helpers/tripCurrencyRules';
import { type Currency, currencyFromCode, fallbackCurrency } from '@/lib/currency';

type CreateBudgetDto = components['schemas']['CreateBudgetDto'];
type TripDto = components['schemas']['TripDto'];

export type BudgetContributors = 'all' | { ids: number[] };

export interface BudgetFormState {
  name: string;
  contributors: BudgetContributors;
}

export function initialBudgetForm(overrides: Partial<BudgetFormState> = {}): BudgetFormState {
  return { name: '', contributors: 'all', ...overrides };
}

/**
 * First individual tap turns "All" off and selects only that member; deselecting the last
 * member falls back to "All" instead of leaving an unsubmittable empty set. Mirrors
 * `AddBudgetDetailsSheet.swift` / `EditBudgetView.swift`'s toggle rule — the single
 * implementation shared by the add-budget sheet, the edit screen and `ContributorChips`.
 */
export function toggleContributorIds(
  contributors: BudgetContributors,
  userId: number,
): BudgetContributors {
  if (contributors === 'all') return { ids: [userId] };
  if (contributors.ids.includes(userId)) {
    const ids = contributors.ids.filter((id) => id !== userId);
    return ids.length === 0 ? 'all' : { ids };
  }
  return { ids: [...contributors.ids, userId] };
}

export function toggleContributor(state: BudgetFormState, userId: number): BudgetFormState {
  return { ...state, contributors: toggleContributorIds(state.contributors, userId) };
}

export function selectAllContributors(state: BudgetFormState): BudgetFormState {
  return { ...state, contributors: 'all' };
}

export function setBudgetName(state: BudgetFormState, name: string): BudgetFormState {
  return { ...state, name };
}

/** Resolved contributor ids, in `acceptedIds` order (each is charged the full amount). */
export function contributorIdsToSave(
  state: BudgetFormState,
  acceptedIds: readonly number[],
): number[] {
  if (state.contributors === 'all') return [...acceptedIds];
  const selected = state.contributors.ids;
  return acceptedIds.filter((id) => selected.includes(id));
}

export function canSubmitBudget(state: BudgetFormState, acceptedIds: readonly number[]): boolean {
  return state.name.trim().length > 0 && contributorIdsToSave(state, acceptedIds).length > 0;
}

/**
 * Projected balance once every selected contributor has paid in — aspirational, not the
 * balance right after saving (`tripMoney.balance` only counts `isPaid` payments, and a fresh
 * `BudgetPayment` defaults to `isPaid: false`).
 */
export function projectedBalance(
  currentBalance: number,
  perPersonAmount: number,
  contributorCount: number,
): number {
  return currentBalance + perPersonAmount * contributorCount;
}

export interface ToCreateBudgetBodyInput {
  /** Amount entered on the keypad step, charged to EACH contributor (not split). */
  amount: number;
  currency: Currency;
  trip: TripDto;
}

/**
 * `CreateBudgetDto` for the entered amount + selected contributors. `userIds` is always sent
 * explicitly (even for "All") — the server does not infer the fan-out from an absent field.
 */
export function toCreateBudgetBody(
  state: BudgetFormState,
  { amount, currency, trip }: ToCreateBudgetBodyInput,
  acceptedIds: readonly number[],
): CreateBudgetDto {
  const homeCurrency = fallbackCurrency(trip.currency);
  const locals = (trip.localCurrencies ?? [])
    .map((c) => currencyFromCode(c))
    .filter((c): c is Currency => Boolean(c));
  const choices = displayCurrencies(homeCurrency, locals);
  const original = originalPayload({
    amount,
    enteredCurrency: currency,
    homeCurrency,
    displayCurrencies: choices,
  });

  const body: CreateBudgetDto = {
    name: state.name.trim() || 'Budget',
    amount,
    scope: 'GROUP',
    // iOS always sends a category (`AddBudgetDetailsSheet.category` defaults to `.restaurant`)
    // — history icons read it. There's no category picker in this port, so default to FOOD.
    category: 'FOOD',
    userIds: contributorIdsToSave(state, acceptedIds),
  };
  if (original.originalAmount !== undefined && original.originalCurrency) {
    body.originalAmount = original.originalAmount;
    body.originalCurrency = original.originalCurrency.code as CreateBudgetDto['originalCurrency'];
  }
  return body;
}
