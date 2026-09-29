import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { StoreEvent } from './store-event.types';

export type ProcessOutcome = 'PROCESSED' | 'DUPLICATE' | 'ORPHANED' | 'FAILED';

@Injectable()
export class StoreEventProcessor {
  private readonly logger = new Logger(StoreEventProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlement: EntitlementService,
  ) {}

  async process(event: StoreEvent): Promise<ProcessOutcome> {
    const isNotification = event.source === 'NOTIFICATION';

    if (isNotification && event.eventId) {
      // Only a fully-PROCESSED row is a true duplicate. Callers (e.g. the Play
      // RTDN handler) may have already claimed this eventId with a bare
      // placeholder row (outcome RECEIVED) before verifying with the store,
      // or a prior attempt may have left it FAILED/ORPHANED — all of those
      // must still go through entitlement.apply() below, not be treated as
      // already-done. persist() upserts, so re-processing the same row is safe.
      const existing = await this.prisma.storeNotification.findUnique({
        where: { notificationUUID: event.eventId },
        select: { outcome: true },
      });
      if (existing?.outcome === 'PROCESSED') return 'DUPLICATE';
    }

    if (event.kind === 'TEST') {
      if (isNotification) await this.persist(event, null, 'PROCESSED');
      return 'PROCESSED';
    }

    const userId = event.userId ?? (await this.resolveUserId(event));

    if (!userId) {
      // An anticipated race (spec 7.3): the RTDN/ASSN arrives BEFORE the
      // client gets a chance to call verify, so there's no ledger row yet to
      // look up. Keep it — Task 6's replay will pick it up once the client
      // verify comes in.
      if (isNotification) await this.persist(event, null, 'ORPHANED');
      this.logger.warn(
        `StoreEvent orphaned: store=${event.store} line=${event.lineId} txn=${event.transactionId}`,
      );
      return 'ORPHANED';
    }

    try {
      await this.entitlement.apply({ ...event, userId });
    } catch (error) {
      this.logger.error('EntitlementService.apply failed', error);
      if (isNotification) await this.persist(event, userId, 'FAILED', error);
      throw error;
    }

    if (isNotification) await this.persist(event, userId, 'PROCESSED');
    return 'PROCESSED';
  }

  /**
   * Replays notifications that were previously ORPHANED for the same lineId,
   * now that we know who the user is (typically right after client verify
   * comes in).
   *
   * ONLY refunds are replayed. A refund is fully described by what we already
   * persisted — applyRefund() needs nothing but lineId + transactionId — so it
   * can be rebuilt offline and applied faithfully.
   *
   * A SUBSCRIPTION_STATE row cannot. Its two decisive fields, `status` and
   * `expiresAt`, are NOT in the stored notification: for Apple `status` comes
   * from a live getAllSubscriptionStatuses() call, for Play from a live
   * purchases.subscriptions.get(). Synthesizing the event without them (the
   * previous behaviour: `productId: ''`, no status, no expiry) made
   * applySubscriptionState() write subscriptionStatus=NONE,
   * subscriptionProductId='', subscriptionExpiresAt=null — i.e. it WIPED the
   * entitlement of a paying user. Because replayOrphans() is only ever called
   * immediately after a successful client verify, the state on record at that
   * moment is already fresher and fully verified; replaying an older
   * subscription doorbell could only ever make it staler or emptier, never
   * better. So we skip those rows and leave them ORPHANED — visible to
   * operators, and still available should a re-query-based replay land later.
   *
   * One failing row must NOT block the rest: they're independent of each
   * other, and a broken payload shouldn't hold a valid refund hostage.
   */
  async replayOrphans(lineId: string, userId?: number): Promise<number> {
    const orphans = await this.prisma.storeNotification.findMany({
      where: { originalTransactionId: lineId, outcome: 'ORPHANED' },
      orderBy: { id: 'asc' },
    });
    if (orphans.length === 0) return 0;

    let replayed = 0;
    let skipped = 0;
    for (const row of orphans) {
      const kind = this.resolveOrphanKind(row.notificationType, row.rawPayload);
      if (kind !== 'REFUND') {
        // Not replayable offline — see the doc comment above.
        skipped += 1;
        continue;
      }
      try {
        await this.entitlement.apply({
          store: (row.store as StoreEvent['store']) ?? 'APPLE',
          source: 'NOTIFICATION',
          eventId: row.notificationUUID,
          kind,
          lineId,
          transactionId: row.transactionId ?? '',
          productId: '',
          userId: userId ?? row.userId ?? undefined,
          environment:
            (row.environment as StoreEvent['environment']) ?? 'Production',
          notificationType: row.notificationType,
          raw: row.rawPayload,
        });
        await this.prisma.storeNotification.update({
          where: { id: row.id },
          data: { outcome: 'PROCESSED', userId, processedAt: new Date() },
        });
        replayed += 1;
      } catch (error) {
        this.logger.error(
          `Replay orphan ${row.id} failed — leaving it ORPHANED for next time`,
          error,
        );
      }
    }
    if (skipped > 0) {
      this.logger.warn(
        `Replay for line ${lineId}: left ${skipped} non-refund orphan(s) ORPHANED — ` +
          `subscription state cannot be rebuilt from a stored notification, and the ` +
          `just-completed verify already carries fresher state`,
      );
    }
    return replayed;
  }

  /**
   * Best-effort kind for a stored notification. The column wins when it's
   * populated. Play RTDN rows used to leave it null (before the adapter was
   * updated to set it), so a rawPayload fallback remains for historical rows
   * that will stay NULL forever.
   */
  private resolveOrphanKind(
    notificationType: string | null,
    rawPayload: unknown,
  ): StoreEvent['kind'] {
    if (notificationType) return this.inferKind(notificationType);
    return this.inferKindFromRaw(rawPayload) ?? 'SUBSCRIPTION_STATE';
  }

  private inferKind(notificationType: string | null): StoreEvent['kind'] {
    if (!notificationType) return 'SUBSCRIPTION_STATE';
    const t = notificationType.toUpperCase();
    if (t.includes('REFUND') || t.includes('REVOKE') || t.includes('VOIDED')) {
      return 'REFUND';
    }
    return 'SUBSCRIPTION_STATE';
  }

  /** Returns null when the payload says nothing about the kind. */
  private inferKindFromRaw(rawPayload: unknown): StoreEvent['kind'] | null {
    if (!rawPayload || typeof rawPayload !== 'object') return null;
    const raw = rawPayload as Record<string, unknown>;
    // Play: voidedPurchaseNotification is the only refund-shaped RTDN.
    if (raw.voidedPurchaseNotification) return 'REFUND';
    // Apple: ResponseBodyV2DecodedPayload carries the type as a string.
    if (typeof raw.notificationType === 'string') {
      return this.inferKind(raw.notificationType);
    }
    return null;
  }

  /** Looks up the user via an existing ledger row. Apple: originalTransactionId. Play: purchaseToken stored in transactionId. */
  private async resolveUserId(event: StoreEvent): Promise<number | null> {
    const row = await this.prisma.subscriptionTransaction.findFirst({
      where: {
        OR: [
          { transactionId: event.transactionId },
          { originalTransactionId: event.lineId },
        ],
      },
      select: { userId: true },
    });
    return row?.userId ?? null;
  }

  private async persist(
    event: StoreEvent,
    userId: number | null,
    outcome: ProcessOutcome,
    error?: unknown,
  ): Promise<void> {
    if (!event.eventId) return;
    const data = {
      notificationType: event.notificationType ?? null,
      originalTransactionId: event.lineId,
      transactionId: event.transactionId,
      environment: event.environment,
      signedDate: event.signedDate ?? null,
      store: event.store,
      rawPayload: (event.raw ?? null) as never,
      userId,
      outcome,
      errorMessage: error instanceof Error ? error.message.slice(0, 255) : null,
      processedAt: outcome === 'PROCESSED' ? new Date() : null,
    };
    // upsert, not create: a row may already exist for this eventId — a
    // caller-side claim placeholder, or a prior FAILED/ORPHANED attempt —
    // and must be overwritten with the real outcome, not conflict on the
    // unique notificationUUID.
    await this.prisma.storeNotification.upsert({
      where: { notificationUUID: event.eventId },
      create: { notificationUUID: event.eventId, ...data },
      update: data,
    });
  }
}
