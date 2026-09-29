import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  AnalyticsEventName,
  Prisma,
  SubscriptionStatus,
  TripStatus,
} from '@prisma/client';
import { AnalyticsService } from '../analytics/analytics.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScanCreditService } from '../scan-credit/scan-credit.service';
import { MarketplaceAcquisitionService } from '../marketplace/acquisition/marketplace-acquisition.service';
import { ClsService } from 'nestjs-cls';
import { CONTENT_LOCALE_CLS_KEY } from '../common/locale/content-locale';
import { isEntitledToPro } from '../common/subscription-status.util';
import {
  MISSION_IDS,
  MissionId,
  SHOP_ITEM_IDS,
  ShopItemDef,
} from './mission-defs';
import { MissionConfigService } from './mission-config.service';
import { isoWeekKey, monthKey, quarterKey } from './period-key.util';
import {
  MissionsOverviewDto,
  RedeemResultDto,
  RedeemRewardDto,
  ReportMissionEventDto,
  ReportMissionEventResultDto,
} from './dto/missions.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const PLAN_AHEAD_MIN_MS = 30 * DAY_MS;

// HTTP 402 like InsufficientScanCreditsException — the client shows the
// balance and the missing amount.
export class InsufficientSparkException extends HttpException {
  constructor(balance: number, price: number) {
    super(
      {
        code: 'insufficient_spark',
        message: `This reward costs ${price}⚡ but you have ${balance}⚡.`,
        balance,
        price,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

interface AwardOpts {
  externalRef?: string;
  // Current period key stored on the row and used for cap counting.
  periodKey?: string;
  cap?: number;
  // 'period' (default): cap counts rows with this periodKey.
  // 'lifetime': cap counts all rows for the mission (friend_joined ×3).
  capScope?: 'period' | 'lifetime';
}

// Spark (⚡) mission ledger. Earn side: `award` writes an append-only
// MissionCompletion inside a per-user advisory-lock transaction (same locking
// discipline as ScanCreditService — the two ledgers share the per-user lock
// key, which is fine: both only serialize per-user writes). Spend side:
// `redeem` recomputes the balance and fulfills the reward in the same
// transaction. Balance is always derived, never stored.
//
// Every public onX trigger handler swallows its own errors: a mission bug must
// never break trip creation, expense entry, or any other host operation.
@Injectable()
export class MissionsService {
  private readonly logger = new Logger(MissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly scanCredit: ScanCreditService,
    private readonly acquisition: MarketplaceAcquisitionService,
    private readonly notifications: NotificationsService,
    // Admin-editable rewards/caps/prices (DB override > mission-defs.ts
    // default, 60s cache). All def reads below go through this.
    private readonly missionConfig: MissionConfigService,
    private readonly cls: ClsService,
  ) {}

  // ── Server-verified triggers (fire-and-forget from host services) ────────

  async onTripCreated(
    userId: number,
    tripId: number,
    startDate: Date | null | undefined,
  ): Promise<void> {
    await this.safely('onTripCreated', userId, async () => {
      await this.award(userId, 'first_trip');
      if (startDate && startDate.getTime() - Date.now() >= PLAN_AHEAD_MIN_MS) {
        await this.award(userId, 'plan_ahead', {
          externalRef: String(tripId),
        });
      }
    });
  }

  // plan_ahead is also earnable when the schedule is set AFTER creation —
  // the iOS client creates trips without dates and fills them in via
  // updateTrip. Idempotent per trip via externalRef, so repeated schedule
  // edits can't double-pay. Awarded only when the updater is the creator
  // (mirrors trip_settled's creator focus).
  async onTripScheduleSet(
    userId: number,
    tripId: number,
    createdById: number,
    startDate: Date | null | undefined,
  ): Promise<void> {
    if (userId !== createdById) return;
    await this.safely('onTripScheduleSet', userId, async () => {
      if (startDate && startDate.getTime() - Date.now() >= PLAN_AHEAD_MIN_MS) {
        await this.award(userId, 'plan_ahead', {
          externalRef: String(tripId),
        });
      }
    });
  }

  async onBoardCreated(userId: number): Promise<void> {
    await this.safely('onBoardCreated', userId, async () => {
      await this.award(userId, 'first_board');
    });
  }

  // Pin extraction can finish for a session whose user row is gone; the emit
  // site passes `row?.userId ?? null`.
  async onScanFinished(userId: number | null | undefined): Promise<void> {
    if (!userId) return;
    await this.safely('onScanFinished', userId, async () => {
      await this.award(userId, 'first_scan');
    });
  }

  async onExpenseAdded(userId: number): Promise<void> {
    await this.safely('onExpenseAdded', userId, async () => {
      await this.award(userId, 'first_expense');
    });
  }

  async onPlanApplied(userId: number): Promise<void> {
    await this.safely('onPlanApplied', userId, async () => {
      await this.award(userId, 'apply_plan');
    });
  }

  // Called after inviteMembers persisted the PENDING rows (with invitedById).
  // invite_2 counts DISTINCT invitee accounts across all trips — inviting the
  // same friend to two trips counts once.
  async onMemberInvited(inviterId: number): Promise<void> {
    await this.safely('onMemberInvited', inviterId, async () => {
      const invitees = await this.prisma.tripMember.findMany({
        where: { invitedById: inviterId, userId: { not: inviterId } },
        distinct: ['userId'],
        select: { userId: true },
        take: 2,
      });
      if (invitees.length >= 2) {
        await this.award(inviterId, 'invite_2');
      }
    });
  }

  // The invite loop's payoff: fires when an accepted, invited, non-creator
  // member loads the trip detail. Pays the INVITER, deduped per invitee
  // account, max 3 lifetime. Sits on the hottest read path in the app, so a
  // lock-free pre-check runs before the award transaction.
  async onInviteeEngaged(inviterId: number, inviteeId: number): Promise<void> {
    if (inviterId === inviteeId) return;
    await this.safely('onInviteeEngaged', inviterId, async () => {
      const existing = await this.prisma.missionCompletion.findMany({
        where: { userId: inviterId, missionId: 'friend_joined' },
        select: { externalRef: true },
      });
      const { missions } = await this.missionConfig.getEffectiveDefs();
      const cap = missions.friend_joined.cap ?? 3;
      if (
        existing.length >= cap ||
        existing.some((r) => r.externalRef === String(inviteeId))
      ) {
        return;
      }
      await this.award(inviterId, 'friend_joined', {
        externalRef: String(inviteeId),
        cap,
        capScope: 'lifetime',
      });
    });
  }

  // trip_settled: trip ENDED ∧ ≥1 expense ∧ every share settled. Called from
  // the ENDED transition and from settle actions against ENDED trips; the
  // predicate is re-checked here so callers stay dumb. Pays the trip creator.
  // A payer's own share of their expense is never settleable (the settlement
  // view nets it out and settleCounterparty never touches it), so it is
  // ignored — otherwise any trip with a personally-paid expense never settles.
  async onTripPossiblySettled(tripId: number): Promise<void> {
    await this.safely('onTripPossiblySettled', tripId, async () => {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { id: true, status: true, createdById: true },
      });
      if (!trip || trip.status !== TripStatus.ENDED) return;
      const [expenseCount, unsettledShares] = await Promise.all([
        this.prisma.expense.count({ where: { tripId } }),
        this.prisma.expenseShare.findMany({
          where: { expense: { tripId }, isSettled: false },
          select: { userId: true, expense: { select: { paidById: true } } },
        }),
      ]);
      const owed = unsettledShares.filter(
        (s) => s.userId !== s.expense.paidById,
      );
      if (expenseCount === 0 || owed.length > 0) return;
      await this.award(trip.createdById, 'trip_settled');
    });
  }

  async onListingRated(userId: number, listingId: number): Promise<void> {
    await this.safely('onListingRated', userId, async () => {
      const { missions } = await this.missionConfig.getEffectiveDefs();
      await this.award(userId, 'rate_plan', {
        externalRef: String(listingId),
        cap: missions.rate_plan.cap,
        capScope: 'lifetime',
      });
    });
  }

  // upload_plan pays when an ADMIN approves the listing (not on submission) —
  // deduped per listing, so re-approval after edits can't double-pay.
  async onListingApproved(userId: number, listingId: number): Promise<void> {
    await this.safely('onListingApproved', userId, async () => {
      const { missions } = await this.missionConfig.getEffectiveDefs();
      await this.award(userId, 'upload_plan', {
        externalRef: String(listingId),
        periodKey: monthKey(),
        cap: missions.upload_plan.cap,
      });
    });
  }

  // ── Client-reported events ───────────────────────────────────────────────

  // share_plan / appstore_review are the accepted client-trust exceptions
  // (small, one-time).
  async handleClientEvent(
    userId: number,
    dto: ReportMissionEventDto,
  ): Promise<ReportMissionEventResultDto> {
    let awarded = false;
    switch (dto.event) {
      case 'market_shared': {
        if (!dto.listingId) {
          throw new BadRequestException(
            'listingId is required for market_shared',
          );
        }
        // One-time: the first share pays once, ever (deduped by the partial
        // unique index like the other one-time missions). The explicit
        // pre-check also covers rows earned under the old weekly-cap scheme,
        // whose week:listing externalRef the null-ref dedupe wouldn't see.
        {
          const already = await this.prisma.missionCompletion.findFirst({
            where: { userId, missionId: 'share_plan' },
            select: { id: true },
          });
          awarded = already ? false : await this.award(userId, 'share_plan');
        }
        break;
      }
      case 'appstore_review_opened':
        awarded = await this.award(userId, 'appstore_review');
        break;
      case 'missions_sheet_viewed':
        // Analytics only — never pays.
        void this.analytics.track(AnalyticsEventName.MISSIONS_SHEET_VIEWED, {
          userId,
          properties: { source: dto.source ?? 'unknown' },
        });
        break;
    }
    return { awarded, balance: await this.balance(userId) };
  }

  // ── Read side ────────────────────────────────────────────────────────────

  async getOverview(userId: number): Promise<MissionsOverviewDto> {
    const { missions: missionDefs, shopItems: shopDefs } =
      await this.missionConfig.getEffectiveDefs();
    const [completions, redemptions, distinctInvitees] = await Promise.all([
      this.prisma.missionCompletion.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.rewardRedemption.findMany({ where: { userId } }),
      this.prisma.tripMember.findMany({
        where: { invitedById: userId, userId: { not: userId } },
        distinct: ['userId'],
        select: { userId: true },
      }),
    ]);

    const totalEarned = completions.reduce((s, c) => s + c.rewardAmount, 0);
    const totalSpent = redemptions.reduce((s, r) => s + r.price, 0);
    const week = isoWeekKey();
    const month = monthKey();
    const quarter = quarterKey();

    const missions = MISSION_IDS.map((id) => {
      const def = missionDefs[id];
      const rows = completions.filter((c) => c.missionId === id);
      const latest = rows.length ? rows[rows.length - 1] : null;
      const periodKey =
        def.capPeriod === 'week'
          ? week
          : def.capPeriod === 'month'
            ? month
            : null;
      const periodUsed =
        def.cap == null
          ? null
          : def.capPeriod === 'lifetime'
            ? rows.length
            : rows.filter((c) => c.periodKey === periodKey).length;

      let progressCurrent: number | null = null;
      if (id === 'invite_2')
        progressCurrent = Math.min(distinctInvitees.length, 2);
      if (id === 'friend_joined') progressCurrent = rows.length;

      // "completed" = nothing left to earn, ever (one-time done, lifetime cap
      // hit). Period-capped missions reset, so they never read completed.
      const completed =
        def.cap == null
          ? rows.length > 0
          : def.capPeriod === 'lifetime'
            ? rows.length >= def.cap
            : false;

      return {
        missionId: id,
        group: def.group,
        rewardAmount: def.reward,
        completed,
        completedAt: latest ? latest.createdAt.toISOString() : null,
        progressCurrent,
        progressTarget: def.progressTarget ?? null,
        periodUsed,
        periodCap: def.cap ?? null,
      };
    });

    const shopItems = SHOP_ITEM_IDS.map((id) => {
      const def = shopDefs[id];
      const rows = redemptions.filter((r) => r.itemId === id);
      const periodUsed =
        def.capPerQuarter == null
          ? null
          : rows.filter((r) => r.periodKey === quarter).length;
      return {
        itemId: id,
        price: def.price,
        rewardType: def.rewardType,
        redeemedCount: rows.length,
        periodUsed,
        periodCap: def.capPerQuarter ?? null,
        available:
          def.capPerQuarter == null || (periodUsed ?? 0) < def.capPerQuarter,
      };
    });

    return {
      balance: totalEarned - totalSpent,
      totalEarned,
      missions,
      shopItems,
    };
  }

  // ── Redeem (spend side) ──────────────────────────────────────────────────

  async redeem(userId: number, dto: RedeemRewardDto): Promise<RedeemResultDto> {
    // Effective price/cap resolved once; every later read (balance check, cap
    // check, ledger snapshot, analytics) flows from this single `def` local,
    // so a concurrent admin price edit can't split one redemption.
    const { shopItems } = await this.missionConfig.getEffectiveDefs();
    const def = shopItems[dto.itemId];
    // Defense in depth: the ValidationPipe's @IsIn already rejects unknown
    // ids over HTTP, but the service must not dereference undefined when
    // called directly.
    if (!def) throw new BadRequestException('Unknown shop item');

    // market_unlock needs the listing (validated + snapshotted). Loaded outside
    // the transaction — the snapshot create's [userId, listingId] unique is the
    // real guard.
    let listing: Awaited<
      ReturnType<
        MarketplaceAcquisitionService['getApprovedListingForAcquisition']
      >
    > | null = null;
    if (def.rewardType === 'market_unlock') {
      if (!dto.listingId) {
        throw new BadRequestException(
          'listingId is required for market_unlock',
        );
      }
      listing = await this.acquisition.getApprovedListingForAcquisition(
        dto.listingId,
      );
      if (listing.createdById === userId) {
        throw new BadRequestException('You cannot unlock your own listing');
      }
    }

    const quarter = quarterKey();
    let newBalance = 0;
    let subscriptionExpiresAt: string | null = null;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::bigint)`;

        const balance = await this.balanceWithTx(tx, userId);
        if (balance < def.price) {
          throw new InsufficientSparkException(balance, def.price);
        }

        if (def.capPerQuarter != null) {
          const used = await tx.rewardRedemption.count({
            where: { userId, itemId: def.id, periodKey: quarter },
          });
          if (used >= def.capPerQuarter) {
            throw new ConflictException(
              `This reward is limited to ${def.capPerQuarter} per quarter.`,
            );
          }
        }

        const redemption = await tx.rewardRedemption.create({
          data: {
            userId,
            itemId: def.id,
            price: def.price,
            listingId: dto.listingId ?? null,
            periodKey: def.capPerQuarter != null ? quarter : null,
          },
        });

        switch (def.rewardType) {
          case 'scan_credit':
            await this.scanCredit.grantMissionReward(
              tx,
              userId,
              def.creditAmount ?? 1,
              `redemption:${redemption.id}`,
            );
            break;
          case 'market_unlock':
            await this.acquisition.createAcquisitionSnapshot(
              tx,
              userId,
              dto.listingId!,
              listing!,
              undefined,
              this.cls.get(CONTENT_LOCALE_CLS_KEY) ?? null,
            );
            break;
          case 'pro_days':
            subscriptionExpiresAt = await this.grantProDays(tx, userId, def);
            break;
        }

        newBalance = balance - def.price;
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        // market_unlock on an already-acquired listing.
        throw new ConflictException('You have already acquired this listing');
      }
      throw e;
    }

    void this.analytics.track(AnalyticsEventName.REWARD_REDEEMED, {
      userId,
      properties: { itemId: def.id, price: def.price },
    });
    if (def.rewardType === 'scan_credit') {
      // Spec §5: scan-credit rewards reuse the existing SCAN_CREDITS_GRANTED
      // flow with source mission_reward.
      void this.analytics.track(AnalyticsEventName.SCAN_CREDITS_GRANTED, {
        userId,
        properties: {
          source: 'mission_reward',
          amount: def.creditAmount ?? 1,
        },
      });
    }

    return {
      itemId: def.id,
      price: def.price,
      newBalance,
      subscriptionExpiresAt,
      listingId: def.rewardType === 'market_unlock' ? dto.listingId! : null,
    };
  }

  // Server-granted timed Pro, mirroring GiftService (gift.service.ts) — the
  // established precedent for non-StoreKit Pro: ACTIVE + gift SKU +
  // autoRenewEnabled=false, expiry extended from max(now, current) so the
  // grant never shortens existing Pro time. Deliberately NOT routed through
  // EntitlementService: that is the Apple-JWS reconciliation writer, and a
  // non-Apple grant pushed through it risks being reconciled away.
  //
  // Rejected while a live App-Store-driven subscription exists (the user has
  // an originalTransactionId and is currently entitled): the next
  // /subscription/validate would rewrite the user row from Apple and silently
  // discard the redeemed days AFTER the spark was burned.
  private async grantProDays(
    tx: Prisma.TransactionClient,
    userId: number,
    def: ShopItemDef,
  ): Promise<string> {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        originalTransactionId: true,
      },
    });
    if (user.originalTransactionId != null && isEntitledToPro(user)) {
      throw new ConflictException(
        'You already have an active Pro subscription — Pro rewards can be redeemed once it ends.',
      );
    }
    const base =
      user.subscriptionExpiresAt && user.subscriptionExpiresAt > new Date()
        ? user.subscriptionExpiresAt.getTime()
        : Date.now();
    const expiresAt = new Date(base + (def.proDays ?? 0) * DAY_MS);
    await tx.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionProductId: def.proProductId,
        subscriptionExpiresAt: expiresAt,
        autoRenewEnabled: false,
      },
    });
    return expiresAt.toISOString();
  }

  // ── Core award primitive ─────────────────────────────────────────────────

  // Append-only, idempotent, capped. Advisory lock serializes per-user writes;
  // the partial unique indexes are the race backstop (P2002 → treated as an
  // idempotent replay). MISSION_COMPLETED fires AFTER commit, only on a real
  // create — same contract as SCAN_PACK_PURCHASED.
  private async award(
    userId: number,
    missionId: MissionId,
    opts: AwardOpts = {},
  ): Promise<boolean> {
    // Resolved here (not in the ~14 trigger handlers) so every award path
    // pays the current admin-configured amount.
    const { missions } = await this.missionConfig.getEffectiveDefs();
    const def = missions[missionId];
    let created = false;
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::bigint)`;
        const dupe = await tx.missionCompletion.findFirst({
          where: {
            userId,
            missionId,
            externalRef: opts.externalRef ?? null,
          },
          select: { id: true },
        });
        if (dupe) return;
        if (opts.cap != null) {
          const count = await tx.missionCompletion.count({
            where: {
              userId,
              missionId,
              ...(opts.capScope === 'lifetime'
                ? {}
                : { periodKey: opts.periodKey }),
            },
          });
          if (count >= opts.cap) return;
        }
        await tx.missionCompletion.create({
          data: {
            userId,
            missionId,
            rewardAmount: def.reward,
            externalRef: opts.externalRef ?? null,
            periodKey: opts.periodKey ?? null,
          },
        });
        created = true;
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        return false;
      }
      throw e;
    }

    if (created) {
      void this.analytics.track(AnalyticsEventName.MISSION_COMPLETED, {
        userId,
        properties: { missionId, rewardAmount: def.reward },
      });
      void this.notifications
        .sendMissionCompletedPush(userId, missionId, def.reward)
        .catch((e) =>
          this.logger.warn(
            `mission_completed push failed for user ${userId}: ${String(e)}`,
          ),
        );
    }
    return created;
  }

  private async balance(userId: number): Promise<number> {
    return this.balanceWithTx(this.prisma, userId);
  }

  private async balanceWithTx(
    tx: PrismaService | Prisma.TransactionClient,
    userId: number,
  ): Promise<number> {
    const [earned, spent] = await Promise.all([
      tx.missionCompletion.aggregate({
        _sum: { rewardAmount: true },
        where: { userId },
      }),
      tx.rewardRedemption.aggregate({
        _sum: { price: true },
        where: { userId },
      }),
    ]);
    return (earned._sum.rewardAmount ?? 0) - (spent._sum.price ?? 0);
  }

  // Trigger-handler guard: mission processing must never break the host
  // operation (trip create, expense add, …). HttpExceptions never escape
  // either — handlers are fire-and-forget.
  private async safely(
    op: string,
    subject: number,
    fn: () => Promise<void>,
  ): Promise<void> {
    try {
      await fn();
    } catch (e) {
      this.logger.error(`${op} failed (subject ${subject})`, e as Error);
    }
  }
}
