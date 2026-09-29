// Whether the ⚡ "unlock this plan" affordance should be offered on a
// marketplace listing. Pure rules so the conditions can be tested without a
// view. Ported from ios OnePlan/View/Market/SparkUnlockRules.swift.

export interface SparkUnlockInputs {
  isPro: boolean;
  isOwnListing: boolean;
  hasApplied: boolean;
  listingApproved: boolean;
  hasShopItem: boolean;
}

export function canSparkUnlock({
  isPro,
  isOwnListing,
  hasApplied,
  listingApproved,
  hasShopItem,
}: SparkUnlockInputs): boolean {
  return !isPro && !isOwnListing && !hasApplied && listingApproved && hasShopItem;
}
