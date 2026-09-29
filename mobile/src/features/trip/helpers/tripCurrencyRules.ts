/**
 * Pure currency-payload rules shared by the trip detail data layer and the
 * add/edit expense & budget screens. Kept free of API/UI dependencies so the
 * gating matrix is unit testable (see `tripCurrencyRules.test.ts`).
 *
 * Port of `ios/OnePlan/OnePlan/Component/Common/Currency/TripCurrencyRules.swift`.
 */

import { currencyEquals, type Currency } from '@/lib/currency';

/**
 * The set of currencies presented to the user in input dropdowns:
 * home + locals, deduplicated (by code), home first.
 */
export function displayCurrencies(
  home: Currency | null | undefined,
  locals: readonly Currency[],
): Currency[] {
  if (!home) return [];
  const seen = new Set<string>([home.code]);
  const result: Currency[] = [home];
  for (const cur of locals) {
    if (seen.has(cur.code)) continue;
    seen.add(cur.code);
    result.push(cur);
  }
  return result;
}

export interface OriginalPayloadInput {
  amount: number;
  enteredCurrency: Currency | null | undefined;
  homeCurrency: Currency | null | undefined;
  displayCurrencies: readonly Currency[];
}

export interface OriginalPayload {
  originalAmount: number | undefined;
  originalCurrency: Currency | undefined;
}

/**
 * Resolves the `(originalAmount, originalCurrency)` pair the API expects on
 * create.
 *
 * Returns undefineds when the user typed in the trip's home currency, or when
 * there was no currency choice to offer in the first place — in both cases
 * `amount` is already in the home currency and sending an "original" pair
 * would just assert a redundant 1:1 conversion.
 */
export function originalPayload({
  amount,
  enteredCurrency,
  homeCurrency,
  displayCurrencies: choices,
}: OriginalPayloadInput): OriginalPayload {
  if (choices.length < 2 || !enteredCurrency || currencyEquals(enteredCurrency, homeCurrency)) {
    return { originalAmount: undefined, originalCurrency: undefined };
  }
  return { originalAmount: amount, originalCurrency: enteredCurrency };
}

/** Amount fields for an edit-save payload. */
export interface EditAmountPayload {
  amount: number | undefined;
  originalAmount: number | undefined;
  originalCurrency: Currency | undefined;
}

export interface EditAmountPayloadInput {
  baselineAmount: number;
  baselineCurrency: Currency;
  currentAmount: number;
  currentCurrency: Currency;
  homeCurrency: Currency;
}

/**
 * Dirty-tracked amount payload for the edit views.
 *
 * When neither the amount nor the entry currency changed, all fields are
 * omitted — the server then preserves the row's stored
 * amount/originalAmount/originalCurrency/exchangeRate verbatim. This is what
 * makes a rename-only save a money no-op: re-sending the original pair would
 * re-convert it at TODAY'S rate and silently drift the stored amount (worst
 * after a group-currency migration, when every row carries an
 * `originalCurrency` different from the new home currency).
 *
 * Compare `currentAmount` against a baseline derived through the SAME text
 * pipeline as the view's amount field (seed → format → parse), not against
 * the raw stored number — display rounding would otherwise mark untouched
 * rows dirty.
 */
export function editAmountPayload({
  baselineAmount,
  baselineCurrency,
  currentAmount,
  currentCurrency,
  homeCurrency,
}: EditAmountPayloadInput): EditAmountPayload {
  const isDirty =
    currentAmount !== baselineAmount || !currencyEquals(currentCurrency, baselineCurrency);
  if (!isDirty) {
    return { amount: undefined, originalAmount: undefined, originalCurrency: undefined };
  }
  if (currencyEquals(currentCurrency, homeCurrency)) {
    // Home-currency entry: `amount` alone; the server resets the original
    // fields to home-currency defaults (rate 1).
    return { amount: currentAmount, originalAmount: undefined, originalCurrency: undefined };
  }
  return {
    amount: currentAmount,
    originalAmount: currentAmount,
    originalCurrency: currentCurrency,
  };
}

/**
 * Dirty-tracked member list: `undefined` (omit from the payload) when the
 * selection is set-equal to the baseline. Sending `memberIds` makes the server
 * re-split ALL shares equally — even with no amount change — which would
 * flatten a receipt-scan expense's uneven item-assigned shares on a
 * rename-only save.
 */
export function changedMemberIds(
  baseline: ReadonlySet<number>,
  current: readonly number[],
): number[] | undefined {
  const currentSet = new Set(current);
  if (currentSet.size === baseline.size && [...currentSet].every((id) => baseline.has(id))) {
    return undefined;
  }
  return [...current];
}

/** Namespace-style export mirroring Swift's `TripCurrencyRules` enum. */
export const TripCurrencyRules = {
  displayCurrencies,
  originalPayload,
  editAmountPayload,
  changedMemberIds,
} as const;
