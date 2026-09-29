import { BadRequestException, ConflictException } from '@nestjs/common';
import { AnalyticsEventName, Prisma, TripStatus } from '@prisma/client';
import { AnalyticsService } from '../analytics/analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScanCreditService } from '../scan-credit/scan-credit.service';
import { ClsService } from 'nestjs-cls';
import { MarketplaceAcquisitionService } from '../marketplace/acquisition/marketplace-acquisition.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  InsufficientSparkException,
  MissionsService,
} from './missions.service';
import { isoWeekKey, monthKey, quarterKey } from './period-key.util';
import { MISSION_DEFS, MISSION_IDS, SHOP_ITEMS } from './mission-defs';
import { MissionConfigService } from './mission-config.service';
import type { RedeemRewardDto } from './dto/missions.dto';

const USER_ID = 42;
const DAY_MS = 24 * 60 * 60 * 1000;

describe('MissionsService', () => {
  let completion: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
    aggregate: jest.Mock;
  };
  let redemption: {
    findMany: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
    aggregate: jest.Mock;
  };
  let tripMember: { findMany: jest.Mock };
  let trip: { findUnique: jest.Mock };
  let expense: { count: jest.Mock };
  let expenseShare: { findMany: jest.Mock };
  let user: { findUniqueOrThrow: jest.Mock; update: jest.Mock };
  let executeRaw: jest.Mock;
  let transaction: jest.Mock;
  let prisma: PrismaService;
  let analyticsMock: { track: jest.Mock };
  let scanCreditMock: { grantMissionReward: jest.Mock };
  let acquisitionMock: {
    getApprovedListingForAcquisition: jest.Mock;
    createAcquisitionSnapshot: jest.Mock;
  };
  let notificationsMock: { sendMissionCompletedPush: jest.Mock };
  let missionConfigMock: { getEffectiveDefs: jest.Mock };
  let service: MissionsService;

  beforeEach(() => {
    completion = {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 1 }),
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _sum: { rewardAmount: 0 } }),
    };
    redemption = {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 7 }),
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _sum: { price: 0 } }),
    };
    tripMember = { findMany: jest.fn().mockResolvedValue([]) };
    trip = { findUnique: jest.fn().mockResolvedValue(null) };
    expense = { count: jest.fn().mockResolvedValue(0) };
    expenseShare = { findMany: jest.fn().mockResolvedValue([]) };
    user = {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        subscriptionStatus: 'NONE',
        subscriptionExpiresAt: null,
        originalTransactionId: null,
      }),
      update: jest.fn().mockResolvedValue({}),
    };
    executeRaw = jest.fn().mockResolvedValue(0);

    const db = {
      missionCompletion: completion,
      rewardRedemption: redemption,
      tripMember,
      trip,
      expense,
      expenseShare,
      user,
      $executeRaw: executeRaw,
    };
    transaction = jest.fn((cb: (tx: typeof db) => unknown) => cb(db));
    prisma = { ...db, $transaction: transaction } as unknown as PrismaService;

    analyticsMock = { track: jest.fn() };
    scanCreditMock = {
      grantMissionReward: jest.fn().mockResolvedValue(undefined),
    };
    acquisitionMock = {
      getApprovedListingForAcquisition: jest.fn().mockResolvedValue({
        id: 5,
        createdById: 99,
      }),
      createAcquisitionSnapshot: jest.fn().mockResolvedValue({ id: 11 }),
    };

    notificationsMock = {
      sendMissionCompletedPush: jest.fn().mockResolvedValue(undefined),
    };

    // Stub returns the code defaults so all literal assertions hold.
    missionConfigMock = {
      getEffectiveDefs: jest.fn().mockResolvedValue({
        missions: MISSION_DEFS,
        shopItems: SHOP_ITEMS,
      }),
    };

    service = new MissionsService(
      prisma,
      analyticsMock as unknown as AnalyticsService,
      scanCreditMock as unknown as ScanCreditService,
      acquisitionMock as unknown as MarketplaceAcquisitionService,
      notificationsMock as unknown as NotificationsService,
      missionConfigMock as unknown as MissionConfigService,
      { get: jest.fn().mockReturnValue(null) } as unknown as ClsService,
    );
  });

  const createdMissionIds = (): string[] =>
    completion.create.mock.calls.map(
      (c) => (c[0] as { data: { missionId: string } }).data.missionId,
    );

  const trackedEvents = (): AnalyticsEventName[] =>
    analyticsMock.track.mock.calls.map((c) => c[0] as AnalyticsEventName);

  // ── award / trigger handlers ─────────────────────────────────────────────

  describe('onTripCreated', () => {
    it('awards first_trip', async () => {
      await service.onTripCreated(USER_ID, 1, null);
      expect(createdMissionIds()).toEqual(['first_trip']);
      expect(trackedEvents()).toEqual([AnalyticsEventName.MISSION_COMPLETED]);
    });

    it('awards plan_ahead when the start date is ≥30 days out', async () => {
      await service.onTripCreated(
        USER_ID,
        9,
        new Date(Date.now() + 31 * DAY_MS),
      );
      expect(createdMissionIds()).toContain('plan_ahead');
      const planAhead = completion.create.mock.calls
        .map((c) => (c[0] as { data: Record<string, unknown> }).data)
        .find((d) => d.missionId === 'plan_ahead')!;
      expect(planAhead.externalRef).toBe('9');
      expect(planAhead.rewardAmount).toBe(20);
    });

    it('does not award plan_ahead below the 30-day boundary', async () => {
      await service.onTripCreated(
        USER_ID,
        9,
        new Date(Date.now() + 29 * DAY_MS),
      );
      expect(createdMissionIds()).not.toContain('plan_ahead');
    });

    it('is idempotent — an existing completion creates nothing new', async () => {
      completion.findFirst.mockResolvedValue({ id: 1 });
      await service.onTripCreated(USER_ID, 1, null);
      expect(completion.create).not.toHaveBeenCalled();
      expect(analyticsMock.track).not.toHaveBeenCalled();
    });

    it('treats a unique-index race (P2002) as an idempotent replay', async () => {
      completion.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dupe', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(
        service.onTripCreated(USER_ID, 1, null),
      ).resolves.toBeUndefined();
      expect(analyticsMock.track).not.toHaveBeenCalled();
    });

    it('never lets an unexpected error escape to the host operation', async () => {
      transaction.mockRejectedValue(new Error('db down'));
      await expect(
        service.onTripCreated(USER_ID, 1, null),
      ).resolves.toBeUndefined();
    });
  });

  describe('onTripScheduleSet (plan_ahead after creation)', () => {
    it('awards plan_ahead + streak when the creator sets a start date ≥30 days out', async () => {
      await service.onTripScheduleSet(
        USER_ID,
        9,
        USER_ID,
        new Date(Date.now() + 31 * DAY_MS),
      );
      expect(createdMissionIds()).toEqual(['plan_ahead']);
      const planAhead = completion.create.mock.calls
        .map((c) => (c[0] as { data: Record<string, unknown> }).data)
        .find((d) => d.missionId === 'plan_ahead')!;
      expect(planAhead.externalRef).toBe('9');
    });

    it('does not award below the 30-day boundary', async () => {
      await service.onTripScheduleSet(
        USER_ID,
        9,
        USER_ID,
        new Date(Date.now() + 29 * DAY_MS),
      );
      expect(completion.create).not.toHaveBeenCalled();
    });

    it('ignores updates from non-creator members', async () => {
      await service.onTripScheduleSet(
        USER_ID,
        9,
        USER_ID + 1,
        new Date(Date.now() + 40 * DAY_MS),
      );
      expect(completion.create).not.toHaveBeenCalled();
    });

    it('is idempotent per trip on repeated schedule edits', async () => {
      completion.findFirst.mockResolvedValue({ id: 1 });
      await service.onTripScheduleSet(
        USER_ID,
        9,
        USER_ID,
        new Date(Date.now() + 40 * DAY_MS),
      );
      expect(completion.create).not.toHaveBeenCalled();
    });
  });

  describe('mission-completed push', () => {
    it('fires on a real create', async () => {
      await service.onTripCreated(USER_ID, 1, null);
      expect(notificationsMock.sendMissionCompletedPush).toHaveBeenCalledTimes(
        1,
      );
      expect(notificationsMock.sendMissionCompletedPush).toHaveBeenCalledWith(
        USER_ID,
        'first_trip',
        10,
      );
    });

    it('does not fire on an idempotent replay', async () => {
      completion.findFirst.mockResolvedValue({ id: 1 });
      await service.onTripCreated(USER_ID, 1, null);
      expect(notificationsMock.sendMissionCompletedPush).not.toHaveBeenCalled();
    });

    it('does not fire on a unique-index race (P2002)', async () => {
      completion.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dupe', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await service.onTripCreated(USER_ID, 1, null);
      expect(notificationsMock.sendMissionCompletedPush).not.toHaveBeenCalled();
    });

    it('a push failure never escapes the award path', async () => {
      notificationsMock.sendMissionCompletedPush.mockRejectedValue(
        new Error('apns down'),
      );
      await expect(
        service.onTripCreated(USER_ID, 1, null),
      ).resolves.toBeUndefined();
      expect(createdMissionIds()).toEqual(['first_trip']);
    });
  });

  describe('onScanFinished', () => {
    it('ignores a null userId (orphaned session)', async () => {
      await service.onScanFinished(null);
      expect(completion.create).not.toHaveBeenCalled();
    });

    it('awards first_scan on success', async () => {
      await service.onScanFinished(USER_ID);
      expect(createdMissionIds()).toEqual(['first_scan']);
    });
  });

  describe('onMemberInvited (invite_2)', () => {
    it('does not award below 2 distinct invitees', async () => {
      tripMember.findMany.mockResolvedValue([{ userId: 7 }]);
      await service.onMemberInvited(USER_ID);
      expect(createdMissionIds()).not.toContain('invite_2');
    });

    it('awards at 2 distinct invitees', async () => {
      tripMember.findMany.mockResolvedValue([{ userId: 7 }, { userId: 8 }]);
      await service.onMemberInvited(USER_ID);
      expect(createdMissionIds()).toContain('invite_2');
    });
  });

  describe('onInviteeEngaged (friend_joined)', () => {
    it('pays the inviter, keyed by invitee id', async () => {
      completion.findMany.mockResolvedValue([]);
      await service.onInviteeEngaged(USER_ID, 7);
      const data = (
        completion.create.mock.calls[0][0] as {
          data: { userId: number; missionId: string; externalRef: string };
        }
      ).data;
      expect(data.userId).toBe(USER_ID);
      expect(data.missionId).toBe('friend_joined');
      expect(data.externalRef).toBe('7');
    });

    it('never pays twice for the same invitee', async () => {
      completion.findMany.mockResolvedValue([{ externalRef: '7' }]);
      await service.onInviteeEngaged(USER_ID, 7);
      expect(completion.create).not.toHaveBeenCalled();
    });

    it('stops at the lifetime cap of 3', async () => {
      completion.findMany.mockResolvedValue([
        { externalRef: '1' },
        { externalRef: '2' },
        { externalRef: '3' },
      ]);
      await service.onInviteeEngaged(USER_ID, 7);
      expect(completion.create).not.toHaveBeenCalled();
    });

    it('ignores self-engagement', async () => {
      await service.onInviteeEngaged(USER_ID, USER_ID);
      expect(completion.findMany).not.toHaveBeenCalled();
    });
  });

  describe('onTripPossiblySettled (trip_settled)', () => {
    beforeEach(() => {
      trip.findUnique.mockResolvedValue({
        id: 3,
        status: TripStatus.ENDED,
        createdById: USER_ID,
      });
      expense.count.mockResolvedValue(2);
      expenseShare.findMany.mockResolvedValue([]);
    });

    it('awards the creator when ENDED with ≥1 expense and all settled', async () => {
      await service.onTripPossiblySettled(3);
      const data = (
        completion.create.mock.calls[0][0] as {
          data: { userId: number; missionId: string };
        }
      ).data;
      expect(data.userId).toBe(USER_ID);
      expect(data.missionId).toBe('trip_settled');
    });

    it('does nothing while the trip is not ENDED', async () => {
      trip.findUnique.mockResolvedValue({
        id: 3,
        status: TripStatus.ONGOING,
        createdById: USER_ID,
      });
      await service.onTripPossiblySettled(3);
      expect(completion.create).not.toHaveBeenCalled();
    });

    it('does nothing without expenses', async () => {
      expense.count.mockResolvedValue(0);
      await service.onTripPossiblySettled(3);
      expect(completion.create).not.toHaveBeenCalled();
    });

    it('does nothing with an unsettled share', async () => {
      expenseShare.findMany.mockResolvedValue([
        { userId: 9, expense: { paidById: USER_ID } },
      ]);
      await service.onTripPossiblySettled(3);
      expect(completion.create).not.toHaveBeenCalled();
    });

    it('ignores the payer\'s own unsettled share of their expense', async () => {
      expenseShare.findMany.mockResolvedValue([
        { userId: USER_ID, expense: { paidById: USER_ID } },
        { userId: 9, expense: { paidById: 9 } },
      ]);
      await service.onTripPossiblySettled(3);
      expect(completion.create).toHaveBeenCalledTimes(1);
    });

    it('still waits on unsettled shares of group-paid expenses', async () => {
      expenseShare.findMany.mockResolvedValue([
        { userId: USER_ID, expense: { paidById: null } },
      ]);
      await service.onTripPossiblySettled(3);
      expect(completion.create).not.toHaveBeenCalled();
    });
  });

  describe('capped repeatables', () => {
    it('rate_plan stops at 3 lifetime', async () => {
      completion.count.mockResolvedValue(3);
      await service.onListingRated(USER_ID, 5);
      expect(createdMissionIds()).not.toContain('rate_plan');
    });

    it('upload_plan stops at 1 per month', async () => {
      completion.count.mockResolvedValue(1);
      await service.onListingApproved(USER_ID, 5);
      expect(createdMissionIds()).not.toContain('upload_plan');
    });
  });

  describe('one-shot trigger handlers', () => {
    it('onBoardCreated awards first_board', async () => {
      await service.onBoardCreated(USER_ID);
      expect(createdMissionIds()).toEqual(['first_board']);
    });

    it('onExpenseAdded awards first_expense', async () => {
      await service.onExpenseAdded(USER_ID);
      expect(createdMissionIds()).toEqual(['first_expense']);
    });

    it('onPlanApplied awards apply_plan', async () => {
      await service.onPlanApplied(USER_ID);
      expect(createdMissionIds()).toEqual(['apply_plan']);
    });

    it('onBoardCreated swallows an unexpected failure', async () => {
      transaction.mockRejectedValue(new Error('db down'));
      await expect(service.onBoardCreated(USER_ID)).resolves.toBeUndefined();
    });
  });

  describe('onListingRated (rate_plan)', () => {
    it('keys the completion by listing id (lifetime, no period)', async () => {
      await service.onListingRated(USER_ID, 5);
      const data = (
        completion.create.mock.calls[0][0] as {
          data: {
            missionId: string;
            externalRef: string;
            periodKey: string | null;
          };
        }
      ).data;
      expect(data.missionId).toBe('rate_plan');
      expect(data.externalRef).toBe('5');
      expect(data.periodKey).toBeNull();
      expect(createdMissionIds()).toEqual(['rate_plan']);
    });

    it('never pays twice for the same listing', async () => {
      completion.findFirst.mockImplementation(
        (args: { where: { missionId: string } }) =>
          Promise.resolve(
            args.where.missionId === 'rate_plan' ? { id: 1 } : null,
          ),
      );
      await service.onListingRated(USER_ID, 5);
      expect(createdMissionIds()).not.toContain('rate_plan');
    });

    it('counts the cap over the mission lifetime (no period filter)', async () => {
      await service.onListingRated(USER_ID, 5);
      const capCall = completion.count.mock.calls[0][0] as {
        where: { missionId: string; periodKey?: string };
      };
      expect(capCall.where.missionId).toBe('rate_plan');
      expect('periodKey' in capCall.where).toBe(false);
    });
  });

  describe('onListingApproved (upload_plan)', () => {
    it('keys the completion by listing id and the current month', async () => {
      await service.onListingApproved(USER_ID, 5);
      const data = (
        completion.create.mock.calls[0][0] as {
          data: {
            missionId: string;
            externalRef: string;
            periodKey: string;
            rewardAmount: number;
          };
        }
      ).data;
      expect(data.missionId).toBe('upload_plan');
      expect(data.externalRef).toBe('5');
      expect(data.periodKey).toBe(monthKey());
      expect(data.rewardAmount).toBe(60);
    });
  });

  // ── client-reported events ───────────────────────────────────────────────

  describe('handleClientEvent', () => {
    it('rejects market_shared without listingId', async () => {
      await expect(
        service.handleClientEvent(USER_ID, { event: 'market_shared' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('pays share_plan once (one-time, no externalRef)', async () => {
      const res = await service.handleClientEvent(USER_ID, {
        event: 'market_shared',
        listingId: 5,
      });
      expect(res.awarded).toBe(true);
      const data = (
        completion.create.mock.calls[0][0] as {
          data: { missionId: string; externalRef: string | null };
        }
      ).data;
      expect(data.missionId).toBe('share_plan');
      expect(data.externalRef).toBeNull();

      // A later share is an idempotent replay — no second payout.
      completion.findFirst.mockResolvedValue({ id: 1 });
      const replay = await service.handleClientEvent(USER_ID, {
        event: 'market_shared',
        listingId: 6,
      });
      expect(replay.awarded).toBe(false);
    });

    it('pays appstore_review once', async () => {
      const first = await service.handleClientEvent(USER_ID, {
        event: 'appstore_review_opened',
      });
      expect(first.awarded).toBe(true);
      completion.findFirst.mockResolvedValue({ id: 1 });
      const replay = await service.handleClientEvent(USER_ID, {
        event: 'appstore_review_opened',
      });
      expect(replay.awarded).toBe(false);
    });

    it('missions_sheet_viewed only forwards analytics', async () => {
      const res = await service.handleClientEvent(USER_ID, {
        event: 'missions_sheet_viewed',
        source: 'home',
      });
      expect(res.awarded).toBe(false);
      expect(completion.create).not.toHaveBeenCalled();
      expect(analyticsMock.track).toHaveBeenCalledWith(
        AnalyticsEventName.MISSIONS_SHEET_VIEWED,
        { userId: USER_ID, properties: { source: 'home' } },
      );
    });
  });

  // ── redeem ───────────────────────────────────────────────────────────────

  describe('redeem', () => {
    const setBalance = (earned: number, spent = 0) => {
      completion.aggregate.mockResolvedValue({
        _sum: { rewardAmount: earned },
      });
      redemption.aggregate.mockResolvedValue({ _sum: { price: spent } });
    };

    it('rejects with 402 when the balance is below the price', async () => {
      setBalance(20);
      await expect(
        service.redeem(USER_ID, { itemId: 'scan_credit_1' }),
      ).rejects.toBeInstanceOf(InsufficientSparkException);
      expect(redemption.create).not.toHaveBeenCalled();
    });

    it('scan_credit_1 grants a mission_reward scan credit and emits both events', async () => {
      setBalance(50);
      const res = await service.redeem(USER_ID, { itemId: 'scan_credit_1' });
      expect(res.newBalance).toBe(20);
      expect(scanCreditMock.grantMissionReward).toHaveBeenCalledWith(
        expect.anything(),
        USER_ID,
        1,
        'redemption:7',
      );
      expect(trackedEvents()).toEqual([
        AnalyticsEventName.REWARD_REDEEMED,
        AnalyticsEventName.SCAN_CREDITS_GRANTED,
      ]);
    });

    it('market_unlock requires listingId', async () => {
      setBalance(100);
      await expect(
        service.redeem(USER_ID, { itemId: 'market_unlock' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("market_unlock rejects the user's own listing", async () => {
      setBalance(100);
      acquisitionMock.getApprovedListingForAcquisition.mockResolvedValue({
        id: 5,
        createdById: USER_ID,
      });
      await expect(
        service.redeem(USER_ID, { itemId: 'market_unlock', listingId: 5 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('market_unlock creates the acquisition snapshot', async () => {
      setBalance(100);
      const res = await service.redeem(USER_ID, {
        itemId: 'market_unlock',
        listingId: 5,
      });
      expect(acquisitionMock.createAcquisitionSnapshot).toHaveBeenCalled();
      expect(res.listingId).toBe(5);
    });

    it('market_unlock maps an already-acquired listing (P2002) to 409', async () => {
      setBalance(100);
      acquisitionMock.createAcquisitionSnapshot.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dupe', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(
        service.redeem(USER_ID, { itemId: 'market_unlock', listingId: 5 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('pro_7d enforces the quarterly cap', async () => {
      setBalance(500);
      redemption.count.mockResolvedValue(2);
      await expect(
        service.redeem(USER_ID, { itemId: 'pro_7d' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('pro redemption is blocked while an App Store subscription is live', async () => {
      setBalance(500);
      user.findUniqueOrThrow.mockResolvedValue({
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: new Date(Date.now() + DAY_MS),
        originalTransactionId: 'apple-txn',
      });
      await expect(
        service.redeem(USER_ID, { itemId: 'pro_7d' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(user.update).not.toHaveBeenCalled();
    });

    it('pro_7d extends a future (non-Apple) expiry rather than restarting it', async () => {
      setBalance(500);
      const existing = new Date(Date.now() + 3 * DAY_MS);
      user.findUniqueOrThrow.mockResolvedValue({
        subscriptionStatus: 'ACTIVE',
        subscriptionExpiresAt: existing,
        originalTransactionId: null,
      });
      const res = await service.redeem(USER_ID, { itemId: 'pro_7d' });
      const updateData = (
        user.update.mock.calls[0][0] as {
          data: { subscriptionExpiresAt: Date; subscriptionProductId: string };
        }
      ).data;
      expect(updateData.subscriptionProductId).toBe('pro_weekly');
      expect(updateData.subscriptionExpiresAt.getTime()).toBe(
        existing.getTime() + 7 * DAY_MS,
      );
      expect(res.subscriptionExpiresAt).toBe(
        updateData.subscriptionExpiresAt.toISOString(),
      );
    });

    it('rejects an item id outside the catalog before touching the ledger', async () => {
      setBalance(500);
      await expect(
        service.redeem(USER_ID, {
          itemId: 'free_pro',
        } as unknown as RedeemRewardDto),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction).not.toHaveBeenCalled();
      expect(redemption.create).not.toHaveBeenCalled();
    });

    it('takes the per-user advisory lock inside the transaction', async () => {
      setBalance(50);
      await service.redeem(USER_ID, { itemId: 'scan_credit_1' });
      expect(executeRaw).toHaveBeenCalled();
    });

    it('stamps the quarter key only on quarter-capped items', async () => {
      setBalance(500);
      await service.redeem(USER_ID, { itemId: 'pro_7d' });
      await service.redeem(USER_ID, { itemId: 'pro_30d' });
      await service.redeem(USER_ID, { itemId: 'scan_credit_1' });
      const periodKeys = redemption.create.mock.calls.map(
        (c) => (c[0] as { data: { periodKey: string | null } }).data.periodKey,
      );
      expect(periodKeys).toEqual([quarterKey(), quarterKey(), null]);
    });

    it('rethrows a non-P2002 failure raised inside the transaction as-is', async () => {
      setBalance(50);
      const boom = new Error('grant exploded');
      scanCreditMock.grantMissionReward.mockRejectedValue(boom);
      await expect(
        service.redeem(USER_ID, { itemId: 'scan_credit_1' }),
      ).rejects.toBe(boom);
    });

    it('tracks no analytics when the redeem fails', async () => {
      setBalance(20);
      await expect(
        service.redeem(USER_ID, { itemId: 'scan_credit_1' }),
      ).rejects.toBeInstanceOf(InsufficientSparkException);
      expect(analyticsMock.track).not.toHaveBeenCalled();
    });

    it('propagates a missing user row from the Pro grant', async () => {
      setBalance(500);
      user.findUniqueOrThrow.mockRejectedValue(new Error('no such user'));
      await expect(
        service.redeem(USER_ID, { itemId: 'pro_7d' }),
      ).rejects.toThrow('no such user');
      expect(analyticsMock.track).not.toHaveBeenCalled();
    });

    it('pro_30d writes a non-renewing ACTIVE Pro row dated from now when the old expiry has passed', async () => {
      setBalance(500);
      user.findUniqueOrThrow.mockResolvedValue({
        subscriptionStatus: 'EXPIRED',
        subscriptionExpiresAt: new Date(Date.now() - 10 * DAY_MS),
        originalTransactionId: null,
      });
      const before = Date.now();
      const res = await service.redeem(USER_ID, { itemId: 'pro_30d' });
      const updateData = (
        user.update.mock.calls[0][0] as {
          data: {
            subscriptionStatus: string;
            subscriptionProductId: string;
            autoRenewEnabled: boolean;
            subscriptionExpiresAt: Date;
          };
        }
      ).data;
      expect(updateData.subscriptionStatus).toBe('ACTIVE');
      expect(updateData.subscriptionProductId).toBe('pro_monthly');
      expect(updateData.autoRenewEnabled).toBe(false);
      // Base is "now", not the stale past expiry.
      expect(updateData.subscriptionExpiresAt.getTime()).toBeGreaterThanOrEqual(
        before + 30 * DAY_MS,
      );
      expect(updateData.subscriptionExpiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + 30 * DAY_MS,
      );
      expect(res.newBalance).toBe(200);
    });
  });

  // ── overview ─────────────────────────────────────────────────────────────

  describe('getOverview', () => {
    it('derives balance and per-mission state from the ledgers', async () => {
      completion.findMany.mockResolvedValue([
        {
          missionId: 'first_trip',
          rewardAmount: 10,
          externalRef: null,
          periodKey: null,
          createdAt: new Date('2026-08-01T00:00:00Z'),
        },
        {
          missionId: 'friend_joined',
          rewardAmount: 30,
          externalRef: '7',
          periodKey: null,
          createdAt: new Date('2026-08-02T00:00:00Z'),
        },
      ]);
      redemption.findMany.mockResolvedValue([
        { itemId: 'scan_credit_1', price: 30, periodKey: null },
      ]);
      tripMember.findMany.mockResolvedValue([{ userId: 7 }]);

      const overview = await service.getOverview(USER_ID);
      expect(overview.totalEarned).toBe(40);
      expect(overview.balance).toBe(10);

      const byId = new Map(overview.missions.map((m) => [m.missionId, m]));
      expect(byId.get('first_trip')!.completed).toBe(true);
      expect(byId.get('friend_joined')!.completed).toBe(false);
      expect(byId.get('friend_joined')!.progressCurrent).toBe(1);
      expect(byId.get('invite_2')!.progressCurrent).toBe(1);
      expect(byId.get('first_scan')!.completed).toBe(false);

      const shop = new Map(overview.shopItems.map((s) => [s.itemId, s]));
      expect(shop.get('scan_credit_1')!.redeemedCount).toBe(1);
      expect(shop.get('pro_7d')!.periodCap).toBe(2);
      expect(shop.get('pro_7d')!.available).toBe(true);
    });

    it('reports an empty ledger as a zero balance with the full catalog uncompleted', async () => {
      const overview = await service.getOverview(USER_ID);
      expect(overview.balance).toBe(0);
      expect(overview.totalEarned).toBe(0);
      expect(overview.missions).toHaveLength(MISSION_IDS.length);
      expect(overview.missions.map((m) => m.missionId)).toEqual([
        ...MISSION_IDS,
      ]);
      expect(overview.missions.every((m) => !m.completed)).toBe(true);
      expect(overview.missions.every((m) => m.completedAt === null)).toBe(true);
      expect(overview.shopItems.every((s) => s.available)).toBe(true);
    });

    it('marks a quarter-capped item unavailable once the cap is spent', async () => {
      redemption.findMany.mockResolvedValue([
        { itemId: 'pro_30d', price: 300, periodKey: quarterKey() },
        // A prior quarter must not count against the current one.
        { itemId: 'pro_7d', price: 150, periodKey: '2025-Q1' },
      ]);
      const shop = new Map(
        (await service.getOverview(USER_ID)).shopItems.map((s) => [
          s.itemId,
          s,
        ]),
      );
      expect(shop.get('pro_30d')!.periodUsed).toBe(1);
      expect(shop.get('pro_30d')!.available).toBe(false);
      expect(shop.get('pro_7d')!.periodUsed).toBe(0);
      expect(shop.get('pro_7d')!.available).toBe(true);
      // Uncapped items are always available.
      expect(shop.get('scan_credit_1')!.periodUsed).toBeNull();
      expect(shop.get('scan_credit_1')!.available).toBe(true);
    });

    it('counts rate_plan lifetime and upload_plan against the current month', async () => {
      completion.findMany.mockResolvedValue([
        {
          missionId: 'rate_plan',
          rewardAmount: 10,
          externalRef: '1',
          periodKey: null,
          createdAt: new Date('2026-08-10T00:00:00Z'),
        },
        {
          missionId: 'rate_plan',
          rewardAmount: 10,
          externalRef: '2',
          periodKey: null,
          createdAt: new Date('2025-01-02T00:00:00Z'),
        },
        {
          missionId: 'upload_plan',
          rewardAmount: 60,
          externalRef: '3',
          periodKey: monthKey(),
          createdAt: new Date('2026-08-11T00:00:00Z'),
        },
        {
          missionId: 'upload_plan',
          rewardAmount: 60,
          externalRef: '4',
          periodKey: '2025-01',
          createdAt: new Date('2025-01-05T00:00:00Z'),
        },
      ]);

      const overview = await service.getOverview(USER_ID);
      const byId = new Map(overview.missions.map((m) => [m.missionId, m]));
      // rate_plan is lifetime-capped: every row counts, completed at the cap.
      expect(byId.get('rate_plan')!.periodUsed).toBe(2);
      expect(byId.get('rate_plan')!.periodCap).toBe(3);
      expect(byId.get('rate_plan')!.completed).toBe(false);
      expect(byId.get('upload_plan')!.periodUsed).toBe(1);
      expect(byId.get('upload_plan')!.periodCap).toBe(1);
      // Month-capped upload_plan resets, so it never reads as completed.
      expect(byId.get('upload_plan')!.completed).toBe(false);
      // Out-of-period rows still count toward lifetime earnings.
      expect(overview.totalEarned).toBe(140);
    });
  });
});
