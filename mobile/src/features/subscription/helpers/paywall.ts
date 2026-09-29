/**
 * Pure paywall helpers — CTA resolution, close rule, and the static point/compare-row data. No
 * React, no expo-iap runtime import (types only), so every branch is unit-testable.
 *
 * Ported from `ios/OnePlan/OnePlan/View/SubscriptionView.swift`:
 *   - `PrimaryAction` + `primaryAction(for:)` (:312-339)
 *   - the purchase-close rule (:109-129 — close only once `currentTier === selected.id`)
 *   - `PaywallPoint` literals (:825-845)
 *   - `priceLabel(for:)` (:680-685)
 * and `ios/OnePlan/OnePlan/View/CompareFeatureView.swift`'s two row tables (:11-66).
 */
import type { Product, ProductSubscription } from 'expo-iap';

import { normalizedPeriod, type Translate } from '@/iap';

export type PrimaryAction = 'subscribe' | 'buy' | 'cancel' | 'upgrade';

/**
 * Resolves the primary CTA. Not-Pro: `subscribe` for an auto-renewable, `buy` otherwise (the
 * `pay_once` lifetime SKU). Pro: `cancel` when the selected plan is the active tier (opens the
 * system Manage Subscriptions sheet), otherwise `upgrade` — an in-group purchase StoreKit/Play
 * prorates.
 */
export function primaryAction(params: {
  isPro: boolean;
  currentTier: string;
  selectedSku: string;
  isSub: boolean;
}): PrimaryAction {
  const { isPro, currentTier, selectedSku, isSub } = params;
  if (!isPro) return isSub ? 'subscribe' : 'buy';
  return selectedSku === currentTier ? 'cancel' : 'upgrade';
}

const ACTION_LABEL_KEYS: Record<PrimaryAction, string> = {
  subscribe: 'Subscribe',
  buy: 'Buy',
  cancel: 'Cancel Subscription',
  upgrade: 'Change Plan',
};

export function actionLabel(action: PrimaryAction, t: Translate): string {
  return t(ACTION_LABEL_KEYS[action]);
}

/**
 * Close the paywall only once the selected plan is actually the active tier — a cancelled/pending
 * purchase never throws, so gating on `isPro` alone would dismiss wrongly for those outcomes.
 */
export function shouldCloseAfterPurchase(currentTier: string, selectedSku: string): boolean {
  return currentTier === selectedSku;
}

const SKU_NAME_KEYS: Record<string, string> = {
  pro_weekly: 'Weekly',
  pro_monthly: 'Monthly',
  pro_yearly: 'Yearly',
};

/** Product card display name — derived from the SKU (not `product.displayName`). */
export function skuNameLabel(sku: string, t: Translate): string {
  return t(SKU_NAME_KEYS[sku] ?? sku);
}

/**
 * Normalized period unit for a subscription product, across both stores. iOS reads
 * `subscriptionPeriodUnitIOS`/`subscriptionPeriodNumberIOS`; Android has no equivalent field on
 * the SDK type, so the last pricing phase's ISO-8601 `billingPeriod` (e.g. `P1Y`) of the first
 * offer is parsed the same way `isoPeriodDays` does.
 */
export function productPeriodLabel(product: ProductSubscription | Product, t: Translate): string {
  if (product.platform === 'ios') {
    const unit = 'subscriptionPeriodUnitIOS' in product ? product.subscriptionPeriodUnitIOS : null;
    const rawCount =
      'subscriptionPeriodNumberIOS' in product ? product.subscriptionPeriodNumberIOS : null;
    const count = Number(rawCount ?? 1);
    return normalizedPeriod(unit, Number.isFinite(count) && count > 0 ? count : 1, t);
  }
  const offers = 'subscriptionOffers' in product ? product.subscriptionOffers : undefined;
  const phases = offers?.[0]?.pricingPhasesAndroid?.pricingPhaseList;
  const iso = phases?.[phases.length - 1]?.billingPeriod;
  const match = iso ? /^P(\d+)([DWMY])$/.exec(iso) : null;
  if (!match) return '';
  const n = Number(match[1]);
  const unit = { D: 'day', W: 'week', M: 'month', Y: 'year' }[match[2] as 'D' | 'W' | 'M' | 'Y'];
  return normalizedPeriod(unit, n, t);
}

/** `$9.99/year` — the card's price row (`priceLabel(for:)`, SubscriptionView.swift:680-685). */
export function productPriceLabel(product: ProductSubscription | Product, t: Translate): string {
  const period = productPeriodLabel(product, t);
  return period ? `${product.displayPrice}/${period}` : product.displayPrice;
}

/** The auto-renewal notice shown under the picker for the selected subscription. */
export function autoRenewNoticeLabel(displayPrice: string, period: string, t: Translate): string {
  return t('Plan auto-renews for %@/%@ until canceled.', { 0: displayPrice, 1: period });
}

/** A single "point" row in the neutral50 features card. */
export interface PaywallPoint {
  /** SF Symbol (iOS) — `PaywallPoint.symbol` rendered with `.symbolVariant(.fill)`. */
  sf: string;
  /** Ionicons stand-in for Android. */
  fallback: string;
  title: string;
  showsVideoQuota?: boolean;
}

/** Port of `SubscriptionView`'s `points:` literal (SubscriptionView.swift:825-845). */
export const PAYWALL_POINTS: PaywallPoint[] = [
  { sf: 'questionmark.square.fill', fallback: 'help-circle', title: 'Request new plan' },
  { sf: 'map.fill', fallback: 'map', title: 'Unlimited planning trips' },
  { sf: 'receipt.fill', fallback: 'receipt', title: 'Split bill by AI' },
  {
    sf: 'play.rectangle.on.rectangle.fill',
    fallback: 'albums',
    title: 'Extract pins by video',
    showsVideoQuota: true,
  },
  { sf: 'signpost.right.fill', fallback: 'navigate', title: 'Trip insights' },
];

/** A compare-features cell: either a checkmark or a short text value. */
export type FeatureValue = { kind: 'check' } | { kind: 'text'; text: string };

export interface CompareFeatureRow {
  title: string;
  basic: FeatureValue;
  pro: FeatureValue;
}

const text = (value: string): FeatureValue => ({ kind: 'text', text: value });
const check: FeatureValue = { kind: 'check' };

/** Port of `CompareFeatureView.unlockWithProRows` (CompareFeatureView.swift:11-37). */
export const UNLOCK_WITH_PRO_ROWS: CompareFeatureRow[] = [
  { title: 'Trips planning', basic: text('Limited'), pro: text('Unlimited') },
  { title: 'Extract pins by social video', basic: text('02'), pro: text('Renewable') },
  { title: 'Upload plans on market', basic: text('-'), pro: check },
  { title: 'Trip insights', basic: text('-'), pro: check },
  { title: 'AI bill split', basic: text('-'), pro: check },
];

/** Port of `CompareFeatureView.includedInAllPlansRows` (CompareFeatureView.swift:39-66). */
export const INCLUDED_IN_ALL_PLANS_ROWS: CompareFeatureRow[] = [
  { title: 'Create trips', basic: check, pro: check },
  { title: 'Build plans manual', basic: check, pro: check },
  { title: 'Unlimited boards', basic: check, pro: check },
  { title: 'Unlimited add friends', basic: check, pro: check },
  { title: 'Invite friends', basic: check, pro: check },
  { title: 'Trip passport', basic: check, pro: check },
];

export const COMPARE_ROWS = {
  unlock: UNLOCK_WITH_PRO_ROWS,
  included: INCLUDED_IN_ALL_PLANS_ROWS,
};
