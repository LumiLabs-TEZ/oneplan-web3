import { Injectable, Logger } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ScanCreditService } from '../../scan-credit/scan-credit.service';
import { StoreEvent } from '../store-event/store-event.types';

/**
 * The ONLY place in the system allowed to write entitlement.
 *
 * No adapter, no controller, and no other service is allowed to write
 * User.subscriptionStatus / SubscriptionTransaction / ScanCreditGrant from a
 * store event. Everything goes through here.
 *
 * Do NOT make network calls here — the data must already be ready in the
 * StoreEvent before entering. An open Postgres transaction waiting on
 * Apple/Google would hold that user's advisory lock the whole time.
 */
@Injectable()
export class EntitlementService {
  private readonly logger = new Logger(EntitlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scanCredit: ScanCreditService,
  ) {}

  async apply(event: StoreEvent): Promise<void> {
    if (event.kind === 'TEST') return;
    if (!event.userId) {
      this.logger.warn(
        `StoreEvent ${event.kind} without userId (line ${event.lineId}) — skipped`,
      );
      return;
    }

    switch (event.kind) {
      case 'SUBSCRIPTION_STATE':
        await this.applySubscriptionState(event, event.userId);
        return;
      case 'ONE_TIME_PURCHASE':
        await this.applyOneTimePurchase(event, event.userId);
        return;
      case 'REFUND':
        await this.applyRefund(event, event.userId);
        return;
      default:
        return;
    }
  }

  /**
   * Fail-closed on entitlement removal (spec 7.4 read the other way round):
   * wrongly REVOKING a paying user is the worst outcome in this file, so an
   * event that doesn't actually know the subscription's state must never be
   * allowed to write. Without this guard a caller that omits `status` lands on
   * `event.status ?? NONE` below and silently downgrades a live subscriber to
   * NONE / '' / null — which is exactly what replayOrphans() used to do with
   * its synthesized events.
   *
   * Both fields are always populated by AppleStoreAdapter/PlayStoreAdapter for
   * a real SUBSCRIPTION_STATE event, so this only ever fires on a
   * programming error, never on a legitimate store event.
   */
  private isWritableSubscriptionState(event: StoreEvent): boolean {
    return event.status != null && event.productId !== '';
  }

  private async applySubscriptionState(
    event: StoreEvent,
    userId: number,
  ): Promise<void> {
    if (!this.isWritableSubscriptionState(event)) {
      this.logger.error(
        `Refusing SUBSCRIPTION_STATE write for user ${userId} (line ${event.lineId}, ` +
          `txn ${event.transactionId}): status=${event.status ?? 'MISSING'}, ` +
          `productId='${event.productId}'. Entitlement left untouched.`,
      );
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::bigint)`;
      await this.upsertLedger(tx, event, userId);
      await tx.user.update({
        where: { id: userId },
        data: {
          subscriptionStatus: event.status ?? SubscriptionStatus.NONE,
          subscriptionProductId: event.productId,
          subscriptionExpiresAt: event.expiresAt ?? null,
          originalTransactionId: event.lineId,
        },
      });
    });

    // Outside the transaction: reconcileProGrants opens its own transaction +
    // advisory lock. Runs for BOTH stores — this is the convergence point,
    // there is no separate branch for Google.
    await this.scanCredit.reconcileProGrants(userId);
  }

  /**
   * Consumables (scan pack) and pay_once. They have NO expiresDate, so
   * running them through the subscription branch would infer ACTIVE and
   * overwrite the user's real status. Only write the ledger + grant credit.
   */
  private async applyOneTimePurchase(
    event: StoreEvent,
    userId: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::bigint)`;
      await this.upsertLedger(tx, event, userId);
    });
    await this.scanCredit.grantPurchase(
      userId,
      event.productId,
      event.transactionId,
      event.environment,
    );
  }

  /**
   * Intentionally fail-open (spec 7.4): when unsure, don't revoke. Grant
   * doesn't exist -> revokePurchase returns null -> skip, don't throw.
   * Wrongly clawing back from a paying user is far more costly than letting
   * a refunded user keep a bit extra.
   *
   * Credits that were ALREADY CONSUMED are not clawed back — the balance
   * never goes negative.
   */
  private async applyRefund(event: StoreEvent, userId: number): Promise<void> {
    try {
      const result = await this.scanCredit.revokePurchase(
        event.lineId,
        event.transactionId,
      );
      if (!result) {
        this.logger.warn(
          `REFUND for user ${userId}: no grant found (line ${event.lineId}, txn ${event.transactionId})`,
        );
      }
    } catch (error) {
      this.logger.error('Refund revoke failed', error);
    }
  }

  private async upsertLedger(
    tx: Prisma.TransactionClient,
    event: StoreEvent,
    userId: number,
  ): Promise<void> {
    const data = {
      userId,
      originalTransactionId: event.lineId,
      productId: event.productId,
      // purchaseDate is NOT NULL on SubscriptionTransaction — mirrors the
      // fallback already used by logTransaction.
      purchaseDate: event.purchasedAt ?? new Date(),
      expiresDate: event.expiresAt ?? null,
      revocationDate: event.revokedAt ?? null,
      environment: event.environment,
    };
    await tx.subscriptionTransaction.upsert({
      where: { transactionId: event.transactionId },
      create: { ...data, transactionId: event.transactionId },
      update: {
        revocationDate: data.revocationDate,
        expiresDate: data.expiresDate,
      },
    });
  }
}
