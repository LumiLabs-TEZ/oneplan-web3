import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { ConflictException } from '@nestjs/common';
import { Currency, MarketplaceListingStatus } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ScanCreditService } from '../../src/scan-credit/scan-credit.service';
import { MarketplaceAcquisitionService } from '../../src/marketplace/acquisition/marketplace-acquisition.service';
import {
  InsufficientSparkException,
  MissionsService,
} from '../../src/missions/missions.service';
import { MISSION_DEFS, SHOP_ITEMS } from '../../src/missions/mission-defs';

/**
 * DB-backed tests for the spark ledger. The invariants under test (the
 * per-user advisory lock serializing concurrent redeems, the partial unique
 * indexes backstopping concurrent awards, and the never-negative derived
 * balance) only exist in Postgres — a mocked Prisma client cannot show them.
 *
 * Opt-in (keeps default `pnpm test` / CI green without a database):
 *   RUN_DB_TESTS=1 pnpm test --testPathPatterns='missions.redeem.db'
 */
const runDb = process.env.RUN_DB_TESTS === '1';
const describeDb = runDb ? describe : describe.skip;

function ensureDatabaseUrl(): void {
  if (process.env.DATABASE_URL) return;
  const envPath = join(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  const line = readFileSync(envPath, 'utf8')
    .split('\n')
    .find((l) => l.startsWith('DATABASE_URL='));
  if (line)
    process.env.DATABASE_URL = line.slice('DATABASE_URL='.length).trim();
}

describeDb('MissionsService spark ledger (DB-backed)', () => {
  let prisma: PrismaService;
  let service: MissionsService;
  const createdUserIds: number[] = [];
  const createdListingIds: number[] = [];
  let seq = 0;

  beforeAll(async () => {
    ensureDatabaseUrl();
    prisma = new PrismaService();
    await prisma.$connect();

    const analytics = { track: jest.fn() } as any; // AnalyticsService
    service = new MissionsService(
      prisma,
      analytics,
      new ScanCreditService(prisma, { get: () => undefined } as any, analytics),
      new MarketplaceAcquisitionService(prisma),
      {
        sendMissionCompletedPush: jest.fn().mockResolvedValue(undefined),
      } as any, // NotificationsService
      {
        // Code defaults; keeps the DB tests off the mission_setting table.
        getEffectiveDefs: jest
          .fn()
          .mockResolvedValue({ missions: MISSION_DEFS, shopItems: SHOP_ITEMS }),
      } as any, // MissionConfigService
    );
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      const where = { userId: { in: createdUserIds } };
      await prisma.acquisitionItem.deleteMany({
        where: { acquisition: where },
      });
      await prisma.marketplaceAcquisition.deleteMany({ where });
      await prisma.scanCreditConsumption.deleteMany({ where });
      await prisma.scanCreditGrant.deleteMany({ where });
      await prisma.rewardRedemption.deleteMany({ where });
      await prisma.missionCompletion.deleteMany({ where });
    }
    if (createdListingIds.length > 0) {
      await prisma.tripPlanMarketItem.deleteMany({
        where: { listingId: { in: createdListingIds } },
      });
      await prisma.marketplaceListing.deleteMany({
        where: { id: { in: createdListingIds } },
      });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma?.$disconnect();
  });

  const tag = () => `${process.pid}-${Date.now()}-${seq++}`;

  async function createUser(): Promise<number> {
    const user = await prisma.user.create({
      data: {
        email: `missions-db-test-${tag()}@test.local`,
        displayName: 'Missions DB Tester',
      },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  /** Seeds `amount` spark as one completion row per 10⚡ chunk. */
  async function seedSpark(userId: number, amount: number): Promise<void> {
    await prisma.missionCompletion.create({
      data: {
        userId,
        missionId: 'db_test_seed',
        rewardAmount: amount,
        externalRef: `seed:${tag()}`,
      },
    });
  }

  async function derivedBalance(userId: number): Promise<number> {
    const [earned, spent] = await Promise.all([
      prisma.missionCompletion.aggregate({
        _sum: { rewardAmount: true },
        where: { userId },
      }),
      prisma.rewardRedemption.aggregate({
        _sum: { price: true },
        where: { userId },
      }),
    ]);
    return (earned._sum.rewardAmount ?? 0) - (spent._sum.price ?? 0);
  }

  async function createApprovedListing(ownerId: number): Promise<number> {
    const listing = await prisma.marketplaceListing.create({
      data: {
        publicId: `mdb${tag()}`.slice(0, 32),
        createdById: ownerId,
        name: 'Missions DB test listing',
        price: 0,
        currency: Currency.USD,
        durationDays: 2,
        status: MarketplaceListingStatus.APPROVED,
        items: {
          create: [
            { dayNumber: 1, title: 'Day 1 stop', sortOrder: 0 },
            { dayNumber: 2, title: 'Day 2 stop', sortOrder: 0 },
          ],
        },
      },
    });
    createdListingIds.push(listing.id);
    return listing.id;
  }

  it('serializes two concurrent redeems of the last 30⚡: one wins, one gets 402', async () => {
    const userId = await createUser();
    await seedSpark(userId, 30);

    const [a, b] = await Promise.allSettled([
      service.redeem(userId, { itemId: 'scan_credit_1' }),
      service.redeem(userId, { itemId: 'scan_credit_1' }),
    ]);
    const outcomes = [a, b];
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const losers = outcomes.filter((o) => o.status === 'rejected');
    expect(losers).toHaveLength(1);
    expect(losers[0].reason).toBeInstanceOf(InsufficientSparkException);

    // The spark was spent exactly once, and the reward fulfilled exactly once.
    expect(await derivedBalance(userId)).toBe(0);
    await expect(
      prisma.rewardRedemption.count({ where: { userId } }),
    ).resolves.toBe(1);
    const grants = await prisma.scanCreditGrant.findMany({ where: { userId } });
    expect(grants).toHaveLength(1);
    expect(grants[0].source).toBe('mission_reward');
    expect(grants[0].amount).toBe(1);
    expect(grants[0].remaining).toBe(1);
  });

  it('awards first_trip once under two concurrent onTripCreated triggers', async () => {
    const userId = await createUser();

    await Promise.all([
      service.onTripCreated(userId, 1, null),
      service.onTripCreated(userId, 1, null),
    ]);

    await expect(
      prisma.missionCompletion.count({
        where: { userId, missionId: 'first_trip' },
      }),
    ).resolves.toBe(1);
  });

  it('unlocks a listing once under a concurrent double redeem, then keeps the balance consistent', async () => {
    const ownerId = await createUser();
    const userId = await createUser();
    const listingId = await createApprovedListing(ownerId);
    await seedSpark(userId, 160);

    const [a, b] = await Promise.allSettled([
      service.redeem(userId, { itemId: 'market_unlock', listingId }),
      service.redeem(userId, { itemId: 'market_unlock', listingId }),
    ]);
    const outcomes = [a, b];
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const losers = outcomes.filter((o) => o.status === 'rejected');
    expect(losers).toHaveLength(1);
    // Either the acquisition unique index (409) or a balance shortfall (402)
    // may lose the race; what matters is that the listing is acquired once and
    // charged once.
    expect(
      losers[0].reason instanceof ConflictException ||
        losers[0].reason instanceof InsufficientSparkException,
    ).toBe(true);

    const acquisitions = await prisma.marketplaceAcquisition.findMany({
      where: { userId },
      include: { items: true },
    });
    expect(acquisitions).toHaveLength(1);
    expect(acquisitions[0].listingId).toBe(listingId);
    expect(acquisitions[0].items).toHaveLength(2);

    // Charged exactly once — the loser's redemption row rolled back with its
    // transaction.
    const redemptions = await prisma.rewardRedemption.findMany({
      where: { userId },
    });
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0].price).toBe(80);
    expect(redemptions[0].periodKey).toBeNull();
    expect(await derivedBalance(userId)).toBe(80);

    // A follow-up mixed sequence must never drive the ledger negative.
    await service.redeem(userId, { itemId: 'scan_credit_1' });
    await expect(
      service.redeem(userId, { itemId: 'pro_30d' }),
    ).rejects.toBeInstanceOf(InsufficientSparkException);
    const finalBalance = await derivedBalance(userId);
    expect(finalBalance).toBe(50);
    expect(finalBalance).toBeGreaterThanOrEqual(0);
  });
});
