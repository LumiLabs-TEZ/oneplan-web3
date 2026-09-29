import { Injectable, Logger } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { StoreEvent, StoreEventSource } from '../store-event/store-event.types';
import { ConfigService } from '@nestjs/config';

export interface PlayVerifiedPurchase {
  kind: 'subscription' | 'product';
  productId: string;
  purchaseToken: string;
  /**
   * Google's per-billing-cycle order id (`GPA.xxxx-xxxx-xxxx-xxxxx..N`, N
   * incrementing on each renewal). Unlike `purchaseToken` — which Google
   * keeps constant for the entire subscription lifetime — this changes every
   * cycle, so it's what makes a renewal's StoreEvent.transactionId distinct
   * from the initial purchase's. Sourced from Android Publisher
   * `purchases.subscriptions.get` v1's `orderId` field.
   */
  orderId?: string | null;
  expiresAt?: Date | null;
  startedAt?: Date | null;
  revoked: boolean;
  isTest?: boolean;
}

export interface PlayEventInput {
  verified: PlayVerifiedPurchase;
  source: StoreEventSource;
  userId?: number;
  status?: SubscriptionStatus;
  isCreditProduct: boolean;
  eventId?: string;
  raw?: unknown;
  linkedPurchaseToken?: string;
  notificationType?: string | null;
}

// RTDN format references:
// https://developer.android.com/google/play/billing/rtdn-reference

export interface DeveloperNotification {
  version: string;
  packageName: string;
  eventTimeMillis: string;
  subscriptionNotification?: SubscriptionNotification;
  oneTimeProductNotification?: OneTimeProductNotification;
  voidedPurchaseNotification?: VoidedPurchaseNotification;
  testNotification?: TestNotification;
}

export interface SubscriptionNotification {
  version: string;
  notificationType: number;
  purchaseToken: string;
  subscriptionId?: string; // It seems subscriptionId is no longer strictly returned in the latest schema at the top level of this object (it relies on DeveloperNotification logic or checking via API), or it might still be there for some versions. Let's make it optional.
}

export interface OneTimeProductNotification {
  version: string;
  notificationType: number;
  purchaseToken: string;
  sku: string;
}

export interface VoidedPurchaseNotification {
  purchaseToken: string;
  orderId: string;
  productType: number; // 1 = inapp, 2 = subs
  refundType: number; // 1 = user requested, 2 = dev requested
}

export interface TestNotification {
  version: string;
}

export function resolvePlayNotificationType(
  notification: DeveloperNotification,
): string | null {
  if (notification.subscriptionNotification) {
    switch (notification.subscriptionNotification.notificationType) {
      case 1:
        return 'SUBSCRIPTION_RECOVERED';
      case 2:
        return 'SUBSCRIPTION_RENEWED';
      case 3:
        return 'SUBSCRIPTION_CANCELED';
      case 4:
        return 'SUBSCRIPTION_PURCHASED';
      case 5:
        return 'SUBSCRIPTION_ON_HOLD';
      case 6:
        return 'SUBSCRIPTION_IN_GRACE_PERIOD';
      case 7:
        return 'SUBSCRIPTION_RESTARTED';
      case 8:
        return 'SUBSCRIPTION_PRICE_CHANGE_CONFIRMED';
      case 9:
        return 'SUBSCRIPTION_DEFERRED';
      case 10:
        return 'SUBSCRIPTION_PAUSED';
      case 11:
        return 'SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED';
      case 12:
        return 'SUBSCRIPTION_REVOKED';
      case 13:
        return 'SUBSCRIPTION_EXPIRED';
      default:
        return `UNKNOWN_SUB_${notification.subscriptionNotification.notificationType}`;
    }
  } else if (notification.oneTimeProductNotification) {
    switch (notification.oneTimeProductNotification.notificationType) {
      case 1:
        return 'ONE_TIME_PRODUCT_PURCHASED';
      case 2:
        return 'ONE_TIME_PRODUCT_CANCELED';
      default:
        return `UNKNOWN_OTP_${notification.oneTimeProductNotification.notificationType}`;
    }
  } else if (notification.voidedPurchaseNotification) {
    return 'VOIDED_PURCHASE';
  } else if (notification.testNotification) {
    return 'TEST_NOTIFICATION';
  }
  return null;
}

/**
 * Translates verified Google Play purchase data or DeveloperNotification RTDNs into a StoreEvent.
 * Must NOT know about Prisma.
 */
@Injectable()
export class PlayStoreAdapter {
  private readonly logger = new Logger(PlayStoreAdapter.name);

  constructor(private readonly configService: ConfigService) {}

  toStoreEvent(input: PlayEventInput): StoreEvent {
    const v = input.verified;
    // `v.revoked` means two different things depending on `v.kind`:
    //  - kind: 'product'      -> Google's purchaseState really does mean the
    //    (one-time) purchase was refunded/revoked. Keep that as REFUND.
    //  - kind: 'subscription' -> it means "expired after the user cancelled
    //    it" (google-play-subscription-verifier.service.ts's `revoked =
    //    expired && cancelledInPast`) — the completely normal end of life of
    //    any cancelled subscription, NOT a refund. A genuine Play
    //    subscription refund arrives as its own voidedPurchaseNotification
    //    RTDN and is turned into a StoreEvent directly by
    //    createRefundEventFromNotification, which never calls this method.
    // Routing a cancelled-then-expired subscription through REFUND here used
    // to make EntitlementService.applyRefund() run instead of
    // applySubscriptionState() — silently discarding the terminal status
    // (SubscriptionStatus.EXPIRED/REVOKED) the caller computed. (Credits were
    // never actually at risk from this: applyRefund -> revokePurchase ->
    // findPurchaseGrant filters source IN ('purchase','pay_once'), which
    // excludes pro_weekly_grant, and the subscription's own token/orderId
    // never matches a scan-pack/pay_once grant's externalRef — it always
    // just logged "no grant found" and no-opped, exactly as observed live.)
    const isGenuineRefund = v.kind === 'product' && v.revoked;
    const kind: StoreEvent['kind'] = isGenuineRefund
      ? 'REFUND'
      : input.isCreditProduct
        ? 'ONE_TIME_PURCHASE'
        : 'SUBSCRIPTION_STATE';

    return {
      store: 'GOOGLE',
      source: input.source,
      eventId: input.eventId,
      kind,
      // If there's a linkedPurchaseToken (an upgrade/downgrade), the older token is the "lineId" we trace
      lineId: input.linkedPurchaseToken ?? v.purchaseToken,
      // SUBSCRIPTION_STATE needs a per-CYCLE id (mirrors Apple's
      // renewalTransactionId) so EntitlementService.upsertLedger creates a
      // new SubscriptionTransaction row per renewal instead of upserting the
      // same row forever, and so ScanCreditService's periodKey (sourced from
      // this field) differs per cycle too. ONE_TIME_PURCHASE / REFUND have no
      // renewal concept, so they keep the purchaseToken unchanged.
      transactionId:
        kind === 'SUBSCRIPTION_STATE' ? this.cyclePeriodId(v) : v.purchaseToken,
      productId: v.productId,
      userId: input.userId,
      status: kind === 'SUBSCRIPTION_STATE' ? input.status : undefined,
      expiresAt: v.expiresAt ?? null,
      purchasedAt: v.startedAt ?? null,
      revokedAt: isGenuineRefund ? new Date() : null,
      environment: v.isTest ? 'Test' : 'Production',
      notificationType: input.notificationType ?? null,
      raw: input.raw,
    };
  }

  /**
   * Per-billing-cycle key for a SUBSCRIPTION_STATE event. `orderId` is the
   * primary source — Google issues a fresh one every renewal (`..0`, `..1`,
   * `..2`, …) while `purchaseToken` stays constant for the subscription's
   * whole lifetime, so keying on the token alone (the pre-fix behaviour)
   * collapsed every cycle onto the same SubscriptionTransaction row and
   * capped Pro subscribers at a single scan-credit grant.
   *
   * Fallback when Google omits `orderId` (undocumented edge case, not
   * normally expected): combine the (globally unique) purchaseToken with the
   * cycle's expiry so cycles still differ from each other. Both
   * `verifyAndAcknowledge` calls for the same cycle (client validate, RTDN)
   * read the same expiry from Google, so this stays deterministic and
   * idempotent across replays — no shared cache needed. If even `expiresAt`
   * is missing, fall back to the bare token — a single grant, matching the
   * pre-fix behaviour, rather than crashing.
   */
  private cyclePeriodId(v: PlayVerifiedPurchase): string {
    if (v.orderId) return v.orderId;
    if (v.expiresAt) return `${v.purchaseToken}:${v.expiresAt.getTime()}`;
    return v.purchaseToken;
  }

  parseDeveloperNotification(base64Data: string): DeveloperNotification | null {
    try {
      const jsonStr = Buffer.from(base64Data, 'base64').toString('utf8');
      return JSON.parse(jsonStr) as DeveloperNotification;
    } catch (error) {
      this.logger.error('Failed to parse RTDN data', error);
      return null;
    }
  }

  /**
   * If the notification is a Refund (VoidedPurchaseNotification), or an expiry,
   * we must derive a StoreEvent directly because the Play API might return
   * 404 or missing active status for voided tokens. For refunds we only need
   * the token to perform the revocation.
   */
  createRefundEventFromNotification(
    notification: DeveloperNotification,
    eventId: string,
    isCreditProduct: boolean,
  ): StoreEvent | null {
    if (notification.voidedPurchaseNotification) {
      return {
        store: 'GOOGLE',
        source: 'NOTIFICATION',
        eventId,
        kind: 'REFUND',
        lineId: notification.voidedPurchaseNotification.purchaseToken,
        transactionId: notification.voidedPurchaseNotification.purchaseToken,
        // The VoidedPurchaseNotification does not include the exact productId (only orderId),
        // but our scanner only needs the token and transaction ID.
        productId: '',
        userId: undefined,
        revokedAt: new Date(Number(notification.eventTimeMillis)),
        environment: 'Production', // Typically production
        notificationType: resolvePlayNotificationType(notification),
        raw: notification,
      };
    }
    return null;
  }
}
