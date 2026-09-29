import { currentTier, isProSku, isProTier, isScanPackSku, packCredits } from './entitlement';
import type { SubscriptionStatusDto } from './types';

function status(
  tier: SubscriptionStatusDto['tier'],
  overrides: Partial<SubscriptionStatusDto> = {},
): SubscriptionStatusDto {
  return { status: 'ACTIVE', tier, autoRenewEnabled: true, ...overrides };
}

describe('isProTier', () => {
  it('is false when status is undefined (fails closed while loading)', () => {
    expect(isProTier(undefined)).toBe(false);
  });

  it('is false for tier "free" regardless of status', () => {
    expect(isProTier(status('free', { status: 'NONE' }))).toBe(false);
    expect(isProTier(status('free', { status: 'EXPIRED' }))).toBe(false);
  });

  it.each([
    ['pro_weekly', 'ACTIVE'],
    ['pro_monthly', 'ACTIVE'],
    ['pro_yearly', 'ACTIVE'],
    ['pay_once', 'NONE'],
    ['pro_monthly', 'BILLING_RETRY'],
    ['pro_monthly', 'GRACE_PERIOD'],
    ['pro_weekly', 'REVOKED'],
    ['pro_weekly', 'EXPIRED'],
  ] as const)('is true for tier %s + status %s (server is the authority)', (tier, st) => {
    expect(isProTier(status(tier, { status: st }))).toBe(true);
  });
});

describe('currentTier', () => {
  it('is "free" when status is undefined', () => {
    expect(currentTier(undefined)).toBe('free');
  });

  it('returns the DTO tier otherwise', () => {
    expect(currentTier(status('pro_yearly'))).toBe('pro_yearly');
  });
});

describe('isScanPackSku / packCredits', () => {
  it.each([
    ['oneplan.video_scan_1', 1],
    ['oneplan.video_scan_5', 5],
    ['oneplan.video_scan_15', 15],
    ['oneplan.video_scan_30', 30],
  ])('parses the trailing count from the %s prefix', (sku, credits) => {
    expect(isScanPackSku(sku)).toBe(true);
    expect(packCredits(sku)).toBe(credits);
  });

  it.each([
    ['scan_pack_1', 1],
    ['scan_pack_5', 5],
    ['scan_pack_15', 15],
    ['scan_pack_30', 30],
  ])('also accepts the legacy %s prefix', (sku, credits) => {
    expect(isScanPackSku(sku)).toBe(true);
    expect(packCredits(sku)).toBe(credits);
  });

  it('returns null / false for a SKU with no known pack prefix', () => {
    expect(isScanPackSku('pro_monthly')).toBe(false);
    expect(packCredits('pro_monthly')).toBeNull();
  });

  it('returns null when the trailing segment is not a number', () => {
    expect(packCredits('oneplan.video_scan_x')).toBeNull();
  });
});

describe('isProSku', () => {
  it.each(['pro_yearly', 'pro_monthly', 'pro_weekly', 'pay_once'])('is true for %s', (sku) => {
    expect(isProSku(sku)).toBe(true);
  });

  it.each(['oneplan.video_scan_5', 'scan_pack_5', 'free', ''])('is false for %s', (sku) => {
    expect(isProSku(sku)).toBe(false);
  });
});
