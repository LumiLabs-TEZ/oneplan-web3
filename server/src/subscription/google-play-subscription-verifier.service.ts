import { BadRequestException, Injectable } from '@nestjs/common';
import {
  GooglePlayPurchaseClient,
  PlayPurchaseKind,
} from '../google-play/google-play-purchase-client';
import { VerifyPlayPurchaseDto } from './dto/verify-play-purchase.dto';

export type { PlayPurchaseKind } from '../google-play/google-play-purchase-client';

export interface VerifiedGooglePlaySubscription {
  kind: PlayPurchaseKind;
  productId: string;
  purchaseToken: string;
  orderId: string | null;
  /** Whether the entitlement is currently valid (active / grace / on-hold). */
  active: boolean;
  /** True only when the purchase has been (or just was) acknowledged. */
  acknowledged: boolean;
  /** Subscription expiry; null for one-time `pay_once` products. */
  expiresAt: Date | null;
  startedAt: Date | null;
  /**
   * True if the caller should downgrade the entitlement instead of granting
   * Pro. Its EXACT meaning differs by `kind`:
   *  - kind: 'product'      -> Google reported the (one-time) purchase as
   *    genuinely refunded/revoked (`purchaseState === 1`).
   *  - kind: 'subscription' -> the subscription has expired AND was
   *    cancelled by the user (`expired && cancelledInPast`) — the normal end
   *    of life of any cancelled subscription. This is NOT a refund signal;
   *    a real subscription refund is a separate voidedPurchaseNotification
   *    RTDN, handled independently of this field. Do not treat `revoked`
   *    as "refunded" for a subscription — see PlayStoreAdapter.toStoreEvent.
   */
  revoked: boolean;
  /**
   * True when Google flagged this as a license-tester purchase
   * (`purchaseType === 0`), i.e. NOT a real production purchase. Absent on a
   * real purchase, so callers must check `=== true`, not truthiness of the
   * underlying Play field.
   */
  isTest: boolean;
  /** Present if this purchase was upgraded/downgraded from an older token. */
  linkedPurchaseToken?: string;
}

/**
 * Verifies Google Play subscription / one-time purchases via the Android
 * Publisher REST API and acknowledges them so Google does not auto-refund
 * after 3 days. The Android Publisher plumbing (auth, get, acknowledge,
 * validation) lives in {@link GooglePlayPurchaseClient}, shared with the
 * marketplace verifier; this service owns only the subscription/product
 * entitlement policy.
 */
@Injectable()
export class GooglePlaySubscriptionVerifierService {
  constructor(private readonly play: GooglePlayPurchaseClient) {}

  /** True when Play Billing server credentials are configured. */
  isConfigured(): boolean {
    return this.play.isConfigured();
  }

  async verifyAndAcknowledge(
    dto: VerifyPlayPurchaseDto,
    kind: PlayPurchaseKind,
  ): Promise<VerifiedGooglePlaySubscription> {
    const packageName = this.play.assertPackageMatches(dto.packageName);
    const accessToken = await this.play.acquireAccessToken();

    return kind === 'subscription'
      ? this.verifySubscription(packageName, accessToken, dto)
      : this.verifyProduct(packageName, accessToken, dto);
  }

  private async verifySubscription(
    packageName: string,
    accessToken: string,
    dto: VerifyPlayPurchaseDto,
  ): Promise<VerifiedGooglePlaySubscription> {
    const sub = await this.play.getSubscription(
      packageName,
      dto.productId,
      dto.purchaseToken,
      accessToken,
    );

    const expiresAt = this.play.parseMillis(sub.expiryTimeMillis);
    const now = Date.now();
    const expired = expiresAt ? expiresAt.getTime() <= now : false;
    const cancelledInPast = sub.userCancellationTimeMillis
      ? Number(sub.userCancellationTimeMillis) <= now
      : false;
    // paymentState 1 = received, 2 = free trial. 0 = pending (e.g. mid
    // billing-retry), undefined when fully expired/cancelled.
    const paid = sub.paymentState === 1 || sub.paymentState === 2;
    // Revenue recognition policy: entitlement follows the expiry window, NOT
    // paymentState. During a grace / on-hold period paymentState is 0 (pending)
    // while expiry is still in the future, and the user must keep Pro instead
    // of being locked out mid billing-retry. An expired *and* cancelled
    // subscription is no longer an entitlement.
    const active = !expired;
    const revoked = expired && cancelledInPast;

    // `paid` gates acknowledgement: only acknowledge once Google has actually
    // received payment (there is nothing to acknowledge for a pending charge).
    let acknowledged = sub.acknowledgementState === 1;
    if (!acknowledged && paid) {
      acknowledged = await this.play.acknowledgeSubscription(
        packageName,
        dto.productId,
        dto.purchaseToken,
        accessToken,
      );
    }

    return {
      kind: 'subscription',
      productId: dto.productId,
      purchaseToken: dto.purchaseToken,
      // Do NOT fall back to dto.orderId here. The client (Play Billing
      // Library) reports the BASE order id without the "..N" renewal suffix
      // — only the Android Publisher REST API (sub.orderId, fetched above)
      // returns the per-cycle suffixed form. Falling back to dto.orderId
      // would hand PlayStoreAdapter a constant id across renewals again,
      // silently reintroducing the single-grant-per-subscription bug. If
      // sub.orderId is ever absent, leave this null so
      // PlayStoreAdapter.cyclePeriodId falls through to its
      // purchaseToken+expiry fallback, which IS per-cycle.
      orderId: sub.orderId ?? null,
      active,
      acknowledged,
      expiresAt,
      startedAt: this.play.parseMillis(sub.startTimeMillis),
      revoked,
      isTest: sub.purchaseType === 0,
      linkedPurchaseToken: sub.linkedPurchaseToken,
    };
  }

  private async verifyProduct(
    packageName: string,
    accessToken: string,
    dto: VerifyPlayPurchaseDto,
  ): Promise<VerifiedGooglePlaySubscription> {
    const product = await this.play.getProduct(
      packageName,
      dto.productId,
      dto.purchaseToken,
      accessToken,
    );

    // purchaseState: 0 = purchased, 1 = cancelled, 2 = pending.
    const purchased = product.purchaseState === 0;
    const revoked = product.purchaseState === 1;
    if (product.purchaseState === 2) {
      throw new BadRequestException('Google Play purchase is pending');
    }

    let acknowledged = product.acknowledgementState === 1;
    if (!acknowledged && purchased) {
      acknowledged = await this.play.acknowledgeProduct(
        packageName,
        dto.productId,
        dto.purchaseToken,
        accessToken,
      );
    }

    return {
      kind: 'product',
      productId: dto.productId,
      purchaseToken: dto.purchaseToken,
      orderId: product.orderId ?? dto.orderId ?? null,
      active: purchased,
      acknowledged,
      // Non-consumable: no expiry — entitlement is permanent until refunded.
      expiresAt: null,
      startedAt: this.play.parseMillis(product.purchaseTimeMillis),
      revoked,
      isTest: product.purchaseType === 0,
    };
  }
}
