// Port of OnePlanTests/TripCurrencyRulesTests.swift (21 cases, 4 suites).
//
// Gating matrix for the pure currency-payload rules behind AddExpense /
// AddBudget / the edit views. The `editAmountPayload` cases are the
// regression suite for the mid-trip group-currency-change bug where a
// rename-only save re-sent the original pair and silently re-converted the
// stored amount at today's rate.

import { CURRENCIES } from '@/lib/currency';
import {
  changedMemberIds,
  displayCurrencies,
  editAmountPayload,
  originalPayload,
  type EditAmountPayload,
} from '@/features/trip/helpers/tripCurrencyRules';

const { USD, VND, THB, KRW } = CURRENCIES;

const noAmountFields: EditAmountPayload = {
  amount: undefined,
  originalAmount: undefined,
  originalCurrency: undefined,
};

describe('TripCurrencyRules — displayCurrencies', () => {
  test('nil home → empty list (trip not loaded)', () => {
    expect(displayCurrencies(null, [THB])).toEqual([]);
  });

  test('home only, no locals', () => {
    expect(displayCurrencies(USD, [])).toEqual([USD]);
  });

  test('home first, then locals in order', () => {
    expect(displayCurrencies(USD, [VND, THB])).toEqual([USD, VND, THB]);
  });

  test('local equal to home is deduped', () => {
    expect(displayCurrencies(THB, [THB])).toEqual([THB]);
  });

  test('duplicate locals are deduped', () => {
    expect(displayCurrencies(USD, [VND, VND])).toEqual([USD, VND]);
  });
});

describe('TripCurrencyRules — originalPayload (create gating)', () => {
  test('entered == home → no original pair', () => {
    const payload = originalPayload({
      amount: 100,
      enteredCurrency: USD,
      homeCurrency: USD,
      displayCurrencies: [USD, THB],
    });
    expect(payload.originalAmount).toBeUndefined();
    expect(payload.originalCurrency).toBeUndefined();
  });

  test('entered foreign → pair sent', () => {
    const payload = originalPayload({
      amount: 100,
      enteredCurrency: THB,
      homeCurrency: USD,
      displayCurrencies: [USD, THB],
    });
    expect(payload.originalAmount).toBe(100);
    expect(payload.originalCurrency).toEqual(THB);
  });

  test('single-currency trip never sends the pair (count < 2 gate)', () => {
    // Even with a nominally foreign entered currency, a trip with no
    // local currencies offers no picker — the gate stays closed.
    const payload = originalPayload({
      amount: 100,
      enteredCurrency: THB,
      homeCurrency: USD,
      displayCurrencies: [USD],
    });
    expect(payload.originalAmount).toBeUndefined();
    expect(payload.originalCurrency).toBeUndefined();
  });

  test('nil entered currency → no pair', () => {
    const payload = originalPayload({
      amount: 100,
      enteredCurrency: null,
      homeCurrency: USD,
      displayCurrencies: [USD, THB],
    });
    expect(payload.originalAmount).toBeUndefined();
    expect(payload.originalCurrency).toBeUndefined();
  });

  test('after a currency change the old home counts as foreign', () => {
    // Home migrated USD → VND; the user keeps typing in USD.
    const payload = originalPayload({
      amount: 42,
      enteredCurrency: USD,
      homeCurrency: VND,
      displayCurrencies: [VND, USD],
    });
    expect(payload.originalAmount).toBe(42);
    expect(payload.originalCurrency).toEqual(USD);
  });
});

describe('TripCurrencyRules — editAmountPayload (dirty tracking)', () => {
  test('untouched foreign row sends no amount fields — the drift repro', () => {
    // Post-migration row: originalCurrency THB on a VND trip. A
    // rename-only save must NOT re-send the pair (the server would
    // re-convert at today's rate).
    const payload = editAmountPayload({
      baselineAmount: 100,
      baselineCurrency: THB,
      currentAmount: 100,
      currentCurrency: THB,
      homeCurrency: VND,
    });
    expect(payload).toEqual(noAmountFields);
  });

  test('untouched home row sends no amount fields', () => {
    const payload = editAmountPayload({
      baselineAmount: 250_000,
      baselineCurrency: VND,
      currentAmount: 250_000,
      currentCurrency: VND,
      homeCurrency: VND,
    });
    expect(payload).toEqual(noAmountFields);
  });

  test('amount changed in home currency → amount only', () => {
    const payload = editAmountPayload({
      baselineAmount: 100,
      baselineCurrency: VND,
      currentAmount: 150,
      currentCurrency: VND,
      homeCurrency: VND,
    });
    expect(payload).toEqual<EditAmountPayload>({
      amount: 150,
      originalAmount: undefined,
      originalCurrency: undefined,
    });
  });

  test('amount changed in foreign currency → pair sent', () => {
    const payload = editAmountPayload({
      baselineAmount: 100,
      baselineCurrency: THB,
      currentAmount: 150,
      currentCurrency: THB,
      homeCurrency: VND,
    });
    expect(payload).toEqual<EditAmountPayload>({
      amount: 150,
      originalAmount: 150,
      originalCurrency: THB,
    });
  });

  test('currency changed, same numeric amount → pair sent (deliberate re-conversion)', () => {
    const payload = editAmountPayload({
      baselineAmount: 100,
      baselineCurrency: THB,
      currentAmount: 100,
      currentCurrency: USD,
      homeCurrency: VND,
    });
    expect(payload).toEqual<EditAmountPayload>({
      amount: 100,
      originalAmount: 100,
      originalCurrency: USD,
    });
  });

  test('currency changed to home → amount only (server resets to rate 1)', () => {
    const payload = editAmountPayload({
      baselineAmount: 100,
      baselineCurrency: THB,
      currentAmount: 100,
      currentCurrency: VND,
      homeCurrency: VND,
    });
    expect(payload).toEqual<EditAmountPayload>({
      amount: 100,
      originalAmount: undefined,
      originalCurrency: undefined,
    });
  });

  test('orphan baseline currency, untouched → stays clean', () => {
    // The row's original currency is no longer in the trip's display
    // list (orphan). Untouched must still omit everything.
    const payload = editAmountPayload({
      baselineAmount: 55,
      baselineCurrency: KRW,
      currentAmount: 55,
      currentCurrency: KRW,
      homeCurrency: USD,
    });
    expect(payload).toEqual(noAmountFields);
  });
});

describe('TripCurrencyRules — changedMemberIds (share-flattening guard)', () => {
  test('unchanged member set → omitted', () => {
    expect(changedMemberIds(new Set([1, 2, 3]), [1, 2, 3])).toBeUndefined();
  });

  test('reordered but set-equal → omitted', () => {
    expect(changedMemberIds(new Set([1, 2, 3]), [3, 1, 2])).toBeUndefined();
  });

  test('member removed → sent', () => {
    expect(changedMemberIds(new Set([1, 2, 3]), [1, 2])).toEqual([1, 2]);
  });

  test('member added → sent', () => {
    expect(changedMemberIds(new Set([1, 2]), [1, 2, 3])).toEqual([1, 2, 3]);
  });
});
