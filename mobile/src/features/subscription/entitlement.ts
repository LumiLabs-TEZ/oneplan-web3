/**
 * Pure entitlement helpers over `SubscriptionStatusDto` — no network, no React. `isProTier` is the
 * single Pro-gate predicate (server-authoritative: the resolved `tier`, never `/auth/me.isPro`, and
 * never a client-side reading of `status` alone — e.g. `BILLING_RETRY` with a Pro `tier` still
 * counts as Pro until the server demotes the tier).
 */
import {
  PAY_ONCE_SKU,
  PRO_SUB_SKUS,
  type SubscriptionStatusDto,
  type SubscriptionTier,
} from './types';

/** `false` while `status` is loading/undefined — Pro gates fail closed. */
export function isProTier(status: SubscriptionStatusDto | undefined): boolean {
  return status?.tier !== undefined && status.tier !== 'free';
}

/** `'free'` when `status` is undefined. */
export function currentTier(status: SubscriptionStatusDto | undefined): SubscriptionTier {
  return status?.tier ?? 'free';
}

const SCAN_PACK_PREFIXES = ['oneplan.video_scan_', 'scan_pack_'] as const;

/** Matches a consumable scan-credit pack SKU (current `oneplan.video_scan_*` or legacy `scan_pack_*`). */
export function isScanPackSku(sku: string): boolean {
  return SCAN_PACK_PREFIXES.some((prefix) => sku.startsWith(prefix));
}

/**
 * Credit count encoded in a scan-pack SKU, e.g. `oneplan.video_scan_15` -> 15. Also accepts the
 * legacy `scan_pack_*` ids (StoreManager.swift `packCredits(for:)`, `StoreManager.swift:101-109`).
 * `null` when the SKU has no known pack prefix, or the trailing segment isn't an integer.
 */
export function packCredits(sku: string): number | null {
  const prefix = SCAN_PACK_PREFIXES.find((p) => sku.startsWith(p));
  if (!prefix) return null;
  const n = Number(sku.slice(prefix.length));
  return Number.isInteger(n) ? n : null;
}

const PRO_SKUS = new Set<string>([...PRO_SUB_SKUS, PAY_ONCE_SKU]);

/** Matches an auto-renewing Pro SKU or the lifetime `pay_once` SKU. */
export function isProSku(sku: string): boolean {
  return PRO_SKUS.has(sku);
}
