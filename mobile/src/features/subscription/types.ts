/**
 * Subscription DTOs + SKU constants shared by the status query, entitlement helpers, and the
 * validate/verify/sync mutations. SKU lists mirror iOS `StoreManager` / `OnePlan.storekit`.
 */
import type { components } from '@/api/schema';

export type SubscriptionStatusDto = components['schemas']['SubscriptionStatusDto'];
export type SubscriptionTier = SubscriptionStatusDto['tier'];
export type SubscriptionStatus = SubscriptionStatusDto['status'];

/** Auto-renewing Pro SKUs, in paywall display order. */
export const PRO_SUB_SKUS = ['pro_yearly', 'pro_monthly', 'pro_weekly'] as const;

/** Consumable scan-credit pack SKUs. */
export const SCAN_PACK_SKUS = [
  'oneplan.video_scan_1',
  'oneplan.video_scan_5',
  'oneplan.video_scan_15',
  'oneplan.video_scan_30',
] as const;

/** Non-consumable lifetime-Pro SKU. */
export const PAY_ONCE_SKU = 'pay_once';
