import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '@prisma/client';
import { PlayStoreAdapter, PlayVerifiedPurchase } from './play-store.adapter';

const verified = (
  over: Partial<PlayVerifiedPurchase> = {},
): PlayVerifiedPurchase => ({
  kind: 'subscription',
  productId: 'pro_weekly',
  purchaseToken: 'g'.repeat(144),
  orderId: 'GPA.3349-1234-5678-90123..0',
  expiresAt: new Date('2026-08-01T00:00:00.000Z'),
  startedAt: new Date('2026-07-25T00:00:00.000Z'),
  revoked: false,
  ...over,
});

describe('PlayStoreAdapter', () => {
  const adapter = new PlayStoreAdapter({} as ConfigService);

  describe('SUBSCRIPTION_STATE transactionId (per-billing-cycle key)', () => {
    it('uses orderId as transactionId while lineId stays the constant purchaseToken', () => {
      const token = verified().purchaseToken;
      const e = adapter.toStoreEvent({
        verified: verified({ purchaseToken: token }),
        source: 'CLIENT_VERIFY',
        status: SubscriptionStatus.ACTIVE,
        isCreditProduct: false,
      });
      expect(e.kind).toBe('SUBSCRIPTION_STATE');
      expect(e.transactionId).toBe('GPA.3349-1234-5678-90123..0');
      expect(e.lineId).toBe(token);
    });

    // Regression proof for the bug: Google keeps purchaseToken constant for
    // the whole subscription lifetime, so 1 purchase + 3 renewals must
    // produce 4 DISTINCT transactionIds (one per orderId) sharing the same
    // lineId — not 4 events collapsing onto a single upserted ledger row.
    it('1 purchase + 3 renewals => 4 distinct transactionIds, 1 shared lineId', () => {
      const token = 'g'.repeat(144);
      const orderIds = [
        'GPA.3349-1234-5678-90123..0',
        'GPA.3349-1234-5678-90123..1',
        'GPA.3349-1234-5678-90123..2',
        'GPA.3349-1234-5678-90123..3',
      ];
      const events = orderIds.map((orderId) =>
        adapter.toStoreEvent({
          verified: verified({ purchaseToken: token, orderId }),
          source: 'NOTIFICATION',
          status: SubscriptionStatus.ACTIVE,
          isCreditProduct: false,
          eventId: `rtdn-${orderId}`,
        }),
      );

      expect(new Set(events.map((e) => e.transactionId)).size).toBe(4);
      expect(events.every((e) => e.lineId === token)).toBe(true);
    });

    it('replaying the identical renewal notification twice yields the same transactionId (idempotent)', () => {
      const input = {
        verified: verified({ orderId: 'GPA.3349-1234-5678-90123..1' }),
        source: 'NOTIFICATION' as const,
        status: SubscriptionStatus.ACTIVE,
        isCreditProduct: false,
        eventId: 'rtdn-redelivered',
      };
      const first = adapter.toStoreEvent(input);
      const second = adapter.toStoreEvent(input);
      expect(first.transactionId).toBe(second.transactionId);
    });

    it('falls back to purchaseToken+expiry when orderId is missing, still distinct per cycle', () => {
      const token = 'p'.repeat(144);
      const e1 = adapter.toStoreEvent({
        verified: verified({
          purchaseToken: token,
          orderId: null,
          expiresAt: new Date('2026-08-01T00:00:00.000Z'),
        }),
        source: 'CLIENT_VERIFY',
        status: SubscriptionStatus.ACTIVE,
        isCreditProduct: false,
      });
      const e2 = adapter.toStoreEvent({
        verified: verified({
          purchaseToken: token,
          orderId: null,
          expiresAt: new Date('2026-08-08T00:00:00.000Z'),
        }),
        source: 'CLIENT_VERIFY',
        status: SubscriptionStatus.ACTIVE,
        isCreditProduct: false,
      });
      expect(e1.transactionId).not.toBe(e2.transactionId);
      expect(e1.transactionId).toContain(token);
      expect(e1.transactionId).not.toBe(token); // never collapses to the bare (constant) token
    });

    it('falls back to the bare purchaseToken when both orderId and expiresAt are missing', () => {
      const token = 'q'.repeat(144);
      const e = adapter.toStoreEvent({
        verified: verified({
          purchaseToken: token,
          orderId: null,
          expiresAt: null,
        }),
        source: 'CLIENT_VERIFY',
        status: SubscriptionStatus.ACTIVE,
        isCreditProduct: false,
      });
      expect(e.transactionId).toBe(token);
    });
  });

  describe('ONE_TIME_PURCHASE / REFUND — untouched by the per-cycle fix', () => {
    it('keeps transactionId = purchaseToken for a credit-pack purchase (no renewal concept)', () => {
      const token = 'r'.repeat(144);
      const e = adapter.toStoreEvent({
        verified: verified({
          purchaseToken: token,
          orderId: 'GPA.9999-irrelevant',
          kind: 'product',
          productId: 'oneplan.video_scan_5',
          expiresAt: null,
        }),
        source: 'CLIENT_VERIFY',
        isCreditProduct: true,
      });
      expect(e.kind).toBe('ONE_TIME_PURCHASE');
      expect(e.transactionId).toBe(token);
    });

    it('keeps transactionId = purchaseToken for a REFUND event (one-time product, genuinely revoked)', () => {
      const token = 's'.repeat(144);
      const e = adapter.toStoreEvent({
        verified: verified({
          purchaseToken: token,
          orderId: 'GPA.9999-irrelevant',
          kind: 'product',
          revoked: true,
        }),
        source: 'NOTIFICATION',
        isCreditProduct: false,
        eventId: 'refund-1',
      });
      expect(e.kind).toBe('REFUND');
      expect(e.transactionId).toBe(token);
      expect(e.revokedAt).not.toBeNull();
    });

    it('still classifies a revoked credit-pack purchase as REFUND (isCreditProduct is irrelevant once genuinely revoked)', () => {
      const token = 't'.repeat(144);
      const e = adapter.toStoreEvent({
        verified: verified({
          purchaseToken: token,
          kind: 'product',
          productId: 'oneplan.video_scan_5',
          revoked: true,
        }),
        source: 'NOTIFICATION',
        isCreditProduct: true,
        eventId: 'refund-2',
      });
      expect(e.kind).toBe('REFUND');
    });
  });

  describe('cancelled-then-expired subscription — must NOT be mislabelled as REFUND', () => {
    // Regression test for the bug: google-play-subscription-verifier's
    // `revoked` field means "expired && cancelledInPast" for a subscription
    // (the normal end of life of any cancellation), never a refund. A real
    // subscription refund arrives as its own voidedPurchaseNotification RTDN
    // and never reaches toStoreEvent(). Routing this case to 'REFUND' used to
    // make EntitlementService discard the terminal status entirely (REFUND
    // events don't write subscriptionStatus) instead of persisting it via
    // SUBSCRIPTION_STATE.
    it('routes to SUBSCRIPTION_STATE (not REFUND) and preserves the caller-computed terminal status', () => {
      const e = adapter.toStoreEvent({
        verified: verified({ revoked: true }),
        source: 'NOTIFICATION',
        status: SubscriptionStatus.EXPIRED,
        isCreditProduct: false,
        eventId: 'cancel-then-expire-1',
      });
      expect(e.kind).toBe('SUBSCRIPTION_STATE');
      expect(e.status).toBe(SubscriptionStatus.EXPIRED);
      expect(e.revokedAt).toBeNull();
    });
  });

  describe('upgrade/downgrade — lineId traces the linked (older) token, unaffected by the cycle-key fix', () => {
    it('SUBSCRIPTION_STATE still uses orderId as transactionId when linkedPurchaseToken is present', () => {
      const e = adapter.toStoreEvent({
        verified: verified({ orderId: 'GPA.new-order..0' }),
        source: 'NOTIFICATION',
        status: SubscriptionStatus.ACTIVE,
        isCreditProduct: false,
        eventId: 'upgrade-1',
        linkedPurchaseToken: 'old-token-123',
      });
      expect(e.lineId).toBe('old-token-123');
      expect(e.transactionId).toBe('GPA.new-order..0');
    });
  });
});
