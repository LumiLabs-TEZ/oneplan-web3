import { SubscriptionStatus } from '@prisma/client';
import {
  effectiveSubscriptionStatus,
  isEntitledToPro,
} from './subscription-status.util';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('effectiveSubscriptionStatus', () => {
  it('collapses a stale ACTIVE row (past expiresAt) to EXPIRED', () => {
    expect(
      effectiveSubscriptionStatus({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionExpiresAt: new Date(Date.now() - DAY_MS),
      }),
    ).toBe(SubscriptionStatus.EXPIRED);
  });

  it('leaves ACTIVE with a future expiresAt untouched', () => {
    expect(
      effectiveSubscriptionStatus({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionExpiresAt: new Date(Date.now() + DAY_MS),
      }),
    ).toBe(SubscriptionStatus.ACTIVE);
  });

  it('leaves GRACE_PERIOD with a past expiresAt untouched (regression guard)', () => {
    expect(
      effectiveSubscriptionStatus({
        subscriptionStatus: SubscriptionStatus.GRACE_PERIOD,
        subscriptionExpiresAt: new Date(Date.now() - DAY_MS),
      }),
    ).toBe(SubscriptionStatus.GRACE_PERIOD);
  });

  it('leaves BILLING_RETRY with a past expiresAt untouched (regression guard)', () => {
    expect(
      effectiveSubscriptionStatus({
        subscriptionStatus: SubscriptionStatus.BILLING_RETRY,
        subscriptionExpiresAt: new Date(Date.now() - DAY_MS),
      }),
    ).toBe(SubscriptionStatus.BILLING_RETRY);
  });

  it('does not expire ACTIVE with a NULL expiresAt (missing data is not lapsed)', () => {
    expect(
      effectiveSubscriptionStatus({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionExpiresAt: null,
      }),
    ).toBe(SubscriptionStatus.ACTIVE);
  });
});

describe('isEntitledToPro', () => {
  it('returns false for a stale ACTIVE row (past expiresAt)', () => {
    expect(
      isEntitledToPro({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionExpiresAt: new Date(Date.now() - DAY_MS),
      }),
    ).toBe(false);
  });

  it('returns true for a live ACTIVE row (future expiresAt)', () => {
    expect(
      isEntitledToPro({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionExpiresAt: new Date(Date.now() + DAY_MS),
      }),
    ).toBe(true);
  });

  it('returns true for GRACE_PERIOD with a past expiresAt', () => {
    expect(
      isEntitledToPro({
        subscriptionStatus: SubscriptionStatus.GRACE_PERIOD,
        subscriptionExpiresAt: new Date(Date.now() - DAY_MS),
      }),
    ).toBe(true);
  });

  it('returns true for BILLING_RETRY', () => {
    expect(
      isEntitledToPro({
        subscriptionStatus: SubscriptionStatus.BILLING_RETRY,
        subscriptionExpiresAt: new Date(Date.now() - DAY_MS),
      }),
    ).toBe(true);
  });

  it('returns true for ACTIVE with a NULL expiresAt', () => {
    expect(
      isEntitledToPro({
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionExpiresAt: null,
      }),
    ).toBe(true);
  });

  it('returns false for EXPIRED / REVOKED / NONE', () => {
    for (const status of [
      SubscriptionStatus.EXPIRED,
      SubscriptionStatus.REVOKED,
      SubscriptionStatus.NONE,
    ]) {
      expect(
        isEntitledToPro({
          subscriptionStatus: status,
          subscriptionExpiresAt: null,
        }),
      ).toBe(false);
    }
  });
});
