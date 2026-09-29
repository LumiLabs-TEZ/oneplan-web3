// Truth table for the ⚡ market-unlock affordance: every blocking condition
// alone must hide it, and only the all-clear case shows it.
// Ported 1:1 from ios OnePlanTests/SparkUnlockRulesTests.swift.

import { canSparkUnlock, type SparkUnlockInputs } from './sparkUnlockRules';

/** The all-clear inputs; each test flips exactly one. */
function canUnlock(overrides: Partial<SparkUnlockInputs> = {}): boolean {
  return canSparkUnlock({
    isPro: false,
    isOwnListing: false,
    hasApplied: false,
    listingApproved: true,
    hasShopItem: true,
    ...overrides,
  });
}

describe('SparkUnlockRules', () => {
  test('All-clear shows the unlock', () => {
    expect(canUnlock()).toBe(true);
  });

  test('Pro users never see it', () => {
    expect(canUnlock({ isPro: true })).toBe(false);
  });

  test('Own listing hides it', () => {
    expect(canUnlock({ isOwnListing: true })).toBe(false);
  });

  test('Already applied hides it', () => {
    expect(canUnlock({ hasApplied: true })).toBe(false);
  });

  test('Non-approved listing hides it', () => {
    expect(canUnlock({ listingApproved: false })).toBe(false);
  });

  test('Missing market_unlock shop item hides it', () => {
    expect(canUnlock({ hasShopItem: false })).toBe(false);
  });

  test('Exhaustive truth table: shown only when every condition is clear', () => {
    for (let bits = 0; bits < 32; bits++) {
      const isPro = (bits & 1) !== 0;
      const isOwnListing = (bits & 2) !== 0;
      const hasApplied = (bits & 4) !== 0;
      const listingApproved = (bits & 8) !== 0;
      const hasShopItem = (bits & 16) !== 0;
      const expected = !isPro && !isOwnListing && !hasApplied && listingApproved && hasShopItem;
      expect(canUnlock({ isPro, isOwnListing, hasApplied, listingApproved, hasShopItem })).toBe(
        expected,
      );
    }
  });
});
