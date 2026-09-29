/**
 * Pure product helpers for the paywall — period maths, ordering, and label formatting. No
 * expo-iap runtime import (types only), no React, no network, so every branch is unit-testable.
 *
 * Ported from `ios/OnePlan/OnePlan/View/SubscriptionView.swift`:
 *   - `periodWeight` (:295-312), `approximateDayCount` (:798-806)
 *   - `normalizedDescription` (:783-795) — the Apple "weekly comes back as 7 days" bug
 *   - `dailyPriceLabel` (:688-697), `videoQuotaLabel` (:346-360)
 * and from `android/.../GooglePlaySubscriptionBillingCoordinator.kt:117-136` for the Android
 * free-trial offer rule (first pricing phase priced at 0 micros).
 *
 * expo-iap names used (node_modules/expo-iap/build/types.d.ts):
 *   `ProductSubscriptionIOS.subscriptionPeriodUnitIOS` / `.subscriptionPeriodNumberIOS` (:1085-1086),
 *   `SubscriptionPeriodIOS` (:1917), `ProductSubscriptionAndroid.subscriptionOffers` (:1044),
 *   `SubscriptionOffer.offerTokenAndroid` (:1882) / `.pricingPhasesAndroid` (:1895),
 *   `PricingPhaseAndroid.billingPeriod` / `.priceAmountMicros` (:922-929).
 */
import type { Product, ProductSubscription, SubscriptionPeriodIOS } from 'expo-iap';

import { PAY_ONCE_SKU, PRO_SUB_SKUS, SCAN_PACK_SKUS } from '@/features/subscription/types';

export { PAY_ONCE_SKU, PRO_SUB_SKUS, SCAN_PACK_SKUS };

/** i18next `t` shape used here — keys are the English source strings. */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

const UNIT_DAYS: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };

/** `'P1W'` -> 7, `'P1M'` -> 30, `'P1Y'` -> 365, `'P7D'` -> 7. `null` when unparseable. */
export function isoPeriodDays(iso: string): number | null {
  const m = /^P(\d+)([DWMY])$/.exec(iso);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = { D: 1, W: 7, M: 30, Y: 365 }[m[2] as 'D' | 'W' | 'M' | 'Y'];
  return unit === undefined ? null : n * unit;
}

/** The regular (last) pricing phase of the product's first Android offer. */
function androidRegularPhase(product: ProductSubscription | Product) {
  if (product.platform !== 'android') return undefined;
  const offers = 'subscriptionOffers' in product ? product.subscriptionOffers : undefined;
  const phases = offers?.[0]?.pricingPhasesAndroid?.pricingPhaseList;
  return phases?.[phases.length - 1];
}

/**
 * Approximate length of a subscription period in days, used to rank plans so the longest one is
 * preselected as "Best value". `-1` when the product exposes no usable period (StoreManager's
 * `periodWeight` guard), which keeps non-subscription products last.
 */
export function periodWeight(product: ProductSubscription | Product): number {
  if (product.platform === 'ios') {
    const unit = 'subscriptionPeriodUnitIOS' in product ? product.subscriptionPeriodUnitIOS : null;
    const days = unit ? UNIT_DAYS[unit] : undefined;
    if (days === undefined) return -1;
    const rawCount =
      'subscriptionPeriodNumberIOS' in product ? product.subscriptionPeriodNumberIOS : null;
    const count = Number(rawCount ?? 1);
    return days * (Number.isFinite(count) && count > 0 ? count : 1);
  }
  const phase = androidRegularPhase(product);
  if (!phase) return -1;
  return isoPeriodDays(phase.billingPeriod) ?? -1;
}

/** Stable paywall order: `PRO_SUB_SKUS` first (yearly, monthly, weekly), unknown SKUs after. */
export function sortByPaywallOrder<T extends ProductSubscription | Product>(products: T[]): T[] {
  const rank = (id: string) => {
    const i = (PRO_SUB_SKUS as readonly string[]).indexOf(id);
    return i === -1 ? PRO_SUB_SKUS.length : i;
  };
  return [...products].sort((a, b) => rank(a.id) - rank(b.id));
}

/** The longest-period SKU ("Best value"), or the first product when no period is known. */
export function defaultSelection(products: (ProductSubscription | Product)[]): string | null {
  if (products.length === 0) return null;
  let best: (ProductSubscription | Product) | null = null;
  let bestWeight = -1;
  for (const p of products) {
    const w = periodWeight(p);
    if (w > bestWeight) {
      bestWeight = w;
      best = p;
    }
  }
  return (bestWeight > 0 ? best?.id : products[0]?.id) ?? null;
}

/**
 * Localized period unit. Apple's Sandbox/App Store reports weekly subscriptions as "7 days" and
 * 2-week offers as "14 days" — normalize both (SubscriptionView.swift:786-794).
 */
export function normalizedPeriod(
  unit: SubscriptionPeriodIOS | string | null | undefined,
  n: number,
  t: Translate,
): string {
  if (unit === 'day' && n === 7) return t('week');
  if (unit === 'day' && n === 14) return t('2 weeks');
  if (unit && unit in UNIT_DAYS) return t(unit);
  return '';
}

/** `t` fallback used when a caller omits it — renders the English source key. */
const identityTranslate: Translate = (key, options) =>
  key.replace('%@', String(options?.[0] ?? ''));

/**
 * `~$1.00/day` — the product price divided by its approximate day count, formatted in the
 * product's currency (`Intl.NumberFormat` picks the right fraction digits, so VND has none).
 * Falls back to `product.description`, exactly like `dailyPriceLabel(for:)` on iOS.
 *
 * `t` is optional so the documented `(product, locale)` call site still type-checks; pass the real
 * `t` from `useTranslation()` in a component so the label is localized.
 */
export function dailyPriceLabel(
  product: ProductSubscription | Product,
  locale: string,
  t: Translate = identityTranslate,
): string {
  const days = periodWeight(product);
  const price = product.price ?? null;
  if (days <= 0 || price === null) return product.description;
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: product.currency,
  }).format(price / days);
  return t('~%@/day', { 0: formatted });
}

/**
 * Scan credits granted per billing cycle. Mirrors the server defaults
 * `SCAN_GRANT_PRO_WEEKLY/_MONTHLY/_YEARLY` = 3 / 20 / 300 and iOS `videoQuotaLabel(for:)`.
 */
export function videoQuotaLabel(sku: string, t: Translate): string {
  const normalized = sku.toLowerCase();
  if (normalized.includes('week')) return t('3 scans / week');
  if (normalized.includes('month')) return t('20 scans / month');
  return t('300 scans / year');
}

/**
 * The Android `offerToken` that must be passed to `requestPurchase` for `sku`. Uses the first
 * offer Google returns (Play orders them by eligibility, so an eligible free trial comes first).
 * `null` on iOS or when the product/offer is missing.
 */
export function androidOfferToken(
  product: ProductSubscription | Product | undefined,
  sku: string,
): string | null {
  if (!product || product.platform !== 'android' || product.id !== sku) return null;
  const offers = 'subscriptionOffers' in product ? product.subscriptionOffers : undefined;
  return offers?.[0]?.offerTokenAndroid ?? null;
}

/**
 * True when any Play offer starts with a zero-priced pricing phase — Android's equivalent of
 * StoreKit's `isEligibleForIntroOffer` (GooglePlaySubscriptionBillingCoordinator.kt:124-126).
 */
export function hasFreeTrialOfferAndroid(
  product: ProductSubscription | Product | undefined,
): boolean {
  if (!product || product.platform !== 'android') return false;
  const offers = 'subscriptionOffers' in product ? product.subscriptionOffers : undefined;
  return (offers ?? []).some(
    (offer) => offer.pricingPhasesAndroid?.pricingPhaseList?.[0]?.priceAmountMicros === '0',
  );
}
