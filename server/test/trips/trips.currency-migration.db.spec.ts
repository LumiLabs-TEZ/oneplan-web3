import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { ConflictException } from '@nestjs/common';
import { Currency, InviteStatus, PlanScope, Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TripsService } from '../../src/trips/trips.service';

/**
 * DB-backed tests for the trip currency migration. The invariants under test
 * (Decimal(18,2) column rounding, transactional atomicity, advisory-lock
 * serialization) cannot be verified with a mocked Prisma client.
 *
 * Opt-in (keeps default `pnpm test` / CI green without a database):
 *   RUN_DB_TESTS=1 pnpm test test/trips/trips.currency-migration.db.spec.ts
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

const D = (n: number | string) => new Prisma.Decimal(n);

// Deterministic, internally consistent rate table (all pairs derived from a
// per-USD value) so A→B→A round-trips are exact and no network is touched.
const USD_PER: Record<string, number> = {
  [Currency.USD]: 1,
  [Currency.VND]: 1 / 25000,
  [Currency.THB]: 0.035,
};

const fakeRates = {
  getRate: async (from: Currency, to: Currency) => ({
    rate: from === to ? D(1) : D(USD_PER[from]).div(D(USD_PER[to])),
    fetchedAt: new Date(),
    isStale: false,
  }),
};

describeDb('TripsService currency migration (DB-backed)', () => {
  let prisma: PrismaService;
  let service: TripsService;
  const createdTripIds: number[] = [];
  const createdUserIds: number[] = [];
  let emailSeq = 0;

  beforeAll(async () => {
    ensureDatabaseUrl();
    prisma = new PrismaService();
    await prisma.$connect();

    service = new TripsService(
      prisma,
      { log: jest.fn() } as any, // TripActivityService
      { getSignedThumbUrl: jest.fn() } as any, // StorageService
      { addPaymentsForMember: jest.fn() } as any, // BudgetsService
      { addMemberToAllPlanItems: jest.fn() } as any, // PlanItemsService
      {
        sendTripSettlementUpdated: jest.fn(),
        sendTripEnded: jest.fn(),
        sendTripDeleted: jest.fn(),
        sendTripInvite: jest.fn(),
        getOnlineUserIds: jest.fn().mockReturnValue([]),
      } as any, // TripsHandler
      {
        sendMemberJoinedPush: jest.fn(),
        sendMemberLeftPush: jest.fn(),
        sendTripInvitePush: jest.fn(),
      } as any, // NotificationsService
      { track: jest.fn() } as any, // AnalyticsService
      fakeRates as any, // ExchangeRatesService
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  afterEach(async () => {
    if (createdTripIds.length > 0) {
      await prisma.trip.deleteMany({ where: { id: { in: createdTripIds } } });
      createdTripIds.length = 0;
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      createdUserIds.length = 0;
    }
  });

  async function createUsers(count: number): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 0; i < count; i++) {
      const user = await prisma.user.create({
        data: {
          email: `cur-mig-db-${process.pid}-${Date.now()}-${emailSeq++}@test.local`,
          displayName: `Migration Tester ${i}`,
        },
      });
      ids.push(user.id);
      createdUserIds.push(user.id);
    }
    return ids;
  }

  async function createTrip(
    creatorId: number,
    memberIds: number[],
    currency: Currency,
  ): Promise<number> {
    const trip = await prisma.trip.create({
      data: {
        name: 'Currency migration test trip',
        currency,
        createdById: creatorId,
        inviteCode: `cur-mig-${process.pid}-${Date.now()}-${emailSeq++}`,
        members: {
          create: memberIds.map((userId) => ({
            userId,
            inviteStatus: InviteStatus.ACCEPTED,
            joinedAt: new Date(),
          })),
        },
      },
    });
    createdTripIds.push(trip.id);
    return trip.id;
  }

  /** Seed the standard fixture on a USD trip and return the created row ids. */
  async function seedMoneyRows(tripId: number, users: number[]) {
    // Home-entered, odd 3-way split: 10.00 → 3.33 / 3.33 / 3.34.
    const homeExpense = await prisma.expense.create({
      data: {
        tripId,
        paidById: users[0],
        name: 'Home dinner',
        amount: D('10'),
        originalAmount: D('10'),
        originalCurrency: Currency.USD,
        exchangeRate: D(1),
        shares: {
          create: [
            { userId: users[0], shareAmount: D('3.33') },
            { userId: users[1], shareAmount: D('3.33') },
            { userId: users[2], shareAmount: D('3.34'), isSettled: true },
          ],
        },
      },
    });
    // Foreign-entered (100 THB → 3.50 USD), 2-way even split.
    const foreignExpense = await prisma.expense.create({
      data: {
        tripId,
        paidById: users[1],
        name: 'Thai street food',
        amount: D('3.5'),
        originalAmount: D('100'),
        originalCurrency: Currency.THB,
        exchangeRate: D('0.035'),
        shares: {
          create: [
            { userId: users[0], shareAmount: D('1.75') },
            { userId: users[1], shareAmount: D('1.75') },
          ],
        },
      },
    });
    // Legacy row: null original fields (pre-currency-support data).
    const legacyExpense = await prisma.expense.create({
      data: {
        tripId,
        paidById: users[0],
        name: 'Legacy taxi',
        amount: D('7.77'),
        shares: { create: [{ userId: users[0], shareAmount: D('7.77') }] },
      },
    });
    // GROUP budget: full amount per contributor, one paid, one unpaid.
    const groupBudget = await prisma.budget.create({
      data: {
        tripId,
        name: 'Group fund',
        amount: D('50'),
        perPersonAmount: D('50'),
        scope: PlanScope.GROUP,
        originalAmount: D('50'),
        originalCurrency: Currency.USD,
        exchangeRate: D(1),
        payments: {
          create: [
            { userId: users[0], amount: D('50'), isPaid: true },
            { userId: users[1], amount: D('50'), isPaid: false },
          ],
        },
      },
    });
    // PERSONAL budget: perPersonAmount stays null.
    const personalBudget = await prisma.budget.create({
      data: {
        tripId,
        name: 'My shopping',
        amount: D('20'),
        perPersonAmount: null,
        scope: PlanScope.PERSONAL,
        payments: { create: [{ userId: users[0], amount: D('20') }] },
      },
    });
    return {
      homeExpense,
      foreignExpense,
      legacyExpense,
      groupBudget,
      personalBudget,
    };
  }

  async function readTripMoney(tripId: number) {
    const [trip, expenses, budgets] = await Promise.all([
      prisma.trip.findUniqueOrThrow({ where: { id: tripId } }),
      prisma.expense.findMany({
        where: { tripId },
        include: { shares: { orderBy: { id: 'asc' } } },
        orderBy: { id: 'asc' },
      }),
      prisma.budget.findMany({
        where: { tripId },
        include: { payments: { orderBy: { id: 'asc' } } },
        orderBy: { id: 'asc' },
      }),
    ]);
    return { trip, expenses, budgets };
  }

  it('migrates every money row atomically with exact Decimal(18,2) invariants', async () => {
    const users = await createUsers(3);
    const tripId = await createTrip(users[0], users, Currency.USD);
    const seeded = await seedMoneyRows(tripId, users);

    await service.updateTrip(tripId, users[0], {
      currency: Currency.VND,
    } as any);

    const { trip, expenses, budgets } = await readTripMoney(tripId);
    expect(trip.currency).toBe(Currency.VND);

    for (const expense of expenses) {
      // sum(shares) === amount, exactly, as stored Decimals.
      const shareSum = expense.shares.reduce(
        (acc, s) => acc.add(s.shareAmount),
        D(0),
      );
      expect(shareSum.equals(expense.amount)).toBe(true);
      // originalAmount × exchangeRate rounds to amount at 2dp.
      expect(
        expense
          .originalAmount!.mul(expense.exchangeRate!)
          .toDecimalPlaces(2)
          .equals(expense.amount),
      ).toBe(true);
    }

    const home = expenses.find((e) => e.id === seeded.homeExpense.id)!;
    expect(home.amount.equals(D('250000'))).toBe(true);
    // Settled share was re-denominated too (by design).
    const settled = home.shares.find((s) => s.isSettled)!;
    expect(settled.shareAmount.equals(D('83500'))).toBe(true);

    const foreign = expenses.find((e) => e.id === seeded.foreignExpense.id)!;
    // Re-derived from 100 THB at THB→VND = 875.
    expect(foreign.amount.equals(D('87500'))).toBe(true);
    expect(foreign.originalCurrency).toBe(Currency.THB);

    const legacy = expenses.find((e) => e.id === seeded.legacyExpense.id)!;
    // Backfilled from the old home currency.
    expect(legacy.originalCurrency).toBe(Currency.USD);
    expect(legacy.originalAmount!.equals(D('7.77'))).toBe(true);
    expect(legacy.amount.equals(D('194250'))).toBe(true);

    const group = budgets.find((b) => b.id === seeded.groupBudget.id)!;
    expect(group.amount.equals(D('1250000'))).toBe(true);
    expect(group.perPersonAmount!.equals(group.amount)).toBe(true);
    for (const payment of group.payments) {
      expect(payment.amount.equals(group.amount)).toBe(true);
    }
    // Paid flag preserved.
    expect(group.payments.some((p) => p.isPaid)).toBe(true);
    expect(group.payments.some((p) => !p.isPaid)).toBe(true);

    const personal = budgets.find((b) => b.id === seeded.personalBudget.id)!;
    expect(personal.perPersonAmount).toBeNull();
    expect(personal.payments[0].amount.equals(personal.amount)).toBe(true);
  });

  it('round-trips USD→VND→USD to the cent for foreign- and home-entered rows', async () => {
    const users = await createUsers(3);
    const tripId = await createTrip(users[0], users, Currency.USD);
    const seeded = await seedMoneyRows(tripId, users);

    await service.updateTrip(tripId, users[0], {
      currency: Currency.VND,
    } as any);
    await service.updateTrip(tripId, users[0], {
      currency: Currency.USD,
    } as any);

    const { trip, expenses } = await readTripMoney(tripId);
    expect(trip.currency).toBe(Currency.USD);

    const home = expenses.find((e) => e.id === seeded.homeExpense.id)!;
    expect(home.amount.equals(D('10'))).toBe(true);
    expect(home.shares.map((s) => s.shareAmount.toString()).sort()).toEqual([
      '3.33',
      '3.33',
      '3.34',
    ]);

    const foreign = expenses.find((e) => e.id === seeded.foreignExpense.id)!;
    expect(foreign.amount.equals(D('3.5'))).toBe(true);
    expect(foreign.originalAmount!.equals(D('100'))).toBe(true);
    expect(foreign.originalCurrency).toBe(Currency.THB);

    const legacy = expenses.find((e) => e.id === seeded.legacyExpense.id)!;
    expect(legacy.amount.equals(D('7.77'))).toBe(true);

    for (const expense of expenses) {
      const shareSum = expense.shares.reduce(
        (acc, s) => acc.add(s.shareAmount),
        D(0),
      );
      expect(shareSum.equals(expense.amount)).toBe(true);
    }
  });

  it('serializes concurrent currency changes: one wins, the loser gets ConflictException', async () => {
    const users = await createUsers(3);
    const tripId = await createTrip(users[0], users, Currency.USD);
    await seedMoneyRows(tripId, users);

    // Hold the trip's advisory lock in a blocker transaction so both PATCHes
    // finish their pre-transaction reads (both observing USD) and queue on
    // the lock — making the conflict deterministic rather than a data race.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const blocker = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${tripId}::bigint)`;
        await held;
      },
      { timeout: 15000 },
    );
    await new Promise((r) => setTimeout(r, 200));

    const racing = Promise.allSettled([
      service.updateTrip(tripId, users[0], { currency: Currency.VND } as any),
      service.updateTrip(tripId, users[1], { currency: Currency.THB } as any),
    ]);
    // Let both calls read currentTrip (USD) and block inside their txs.
    await new Promise((r) => setTimeout(r, 300));
    release();
    await blocker;

    const [a, b] = await racing;
    const outcomes = [a, b];
    const winners = outcomes.filter((o) => o.status === 'fulfilled');
    const losers = outcomes.filter((o) => o.status === 'rejected');
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0].reason).toBeInstanceOf(ConflictException);

    const winnerCurrency = (
      winners[0] as PromiseFulfilledResult<{ currency: Currency }>
    ).value.currency;
    const { trip, expenses, budgets } = await readTripMoney(tripId);
    expect(trip.currency).toBe(winnerCurrency);
    // No mixed-denomination rows: every invariant holds in the winner's
    // currency.
    for (const expense of expenses) {
      const shareSum = expense.shares.reduce(
        (acc, s) => acc.add(s.shareAmount),
        D(0),
      );
      expect(shareSum.equals(expense.amount)).toBe(true);
      expect(
        expense
          .originalAmount!.mul(expense.exchangeRate!)
          .toDecimalPlaces(2)
          .equals(expense.amount),
      ).toBe(true);
    }
    for (const budget of budgets) {
      for (const payment of budget.payments) {
        expect(payment.amount.equals(budget.amount)).toBe(true);
      }
    }
  });

  it('rolls back the entire migration when one row overflows mid-transaction', async () => {
    const users = await createUsers(3);
    const tripId = await createTrip(users[0], users, Currency.USD);
    await seedMoneyRows(tripId, users);
    // 10^14 THB × THB→VND (875) = 8.75×10^16 — overflows Decimal(18,2)
    // (max 16 integer digits), raising a numeric overflow mid-migration.
    await prisma.expense.create({
      data: {
        tripId,
        paidById: users[0],
        name: 'Overflow bomb',
        amount: D('3500000000000'),
        originalAmount: D('100000000000000'),
        originalCurrency: Currency.THB,
        exchangeRate: D('0.035'),
        shares: {
          create: [{ userId: users[0], shareAmount: D('3500000000000') }],
        },
      },
    });
    const before = await readTripMoney(tripId);

    await expect(
      service.updateTrip(tripId, users[0], {
        currency: Currency.VND,
      } as any),
    ).rejects.toThrow();

    const after = await readTripMoney(tripId);
    expect(after.trip.currency).toBe(Currency.USD);
    // Every amount is byte-identical to the seed — nothing partially
    // migrated.
    expect(
      after.expenses.map((e) => [
        e.id,
        e.amount.toString(),
        e.originalAmount?.toString() ?? null,
        e.originalCurrency,
        e.shares.map((s) => s.shareAmount.toString()),
      ]),
    ).toEqual(
      before.expenses.map((e) => [
        e.id,
        e.amount.toString(),
        e.originalAmount?.toString() ?? null,
        e.originalCurrency,
        e.shares.map((s) => s.shareAmount.toString()),
      ]),
    );
    expect(
      after.budgets.map((b) => [
        b.id,
        b.amount.toString(),
        b.payments.map((p) => p.amount.toString()),
      ]),
    ).toEqual(
      before.budgets.map((b) => [
        b.id,
        b.amount.toString(),
        b.payments.map((p) => p.amount.toString()),
      ]),
    );
  });

  it('does not resurrect a removed member’s share on a later currency change', async () => {
    const users = await createUsers(3);
    const tripId = await createTrip(users[0], users, Currency.USD);
    // Foreign-entered expense split three ways: 300 THB → 10.50 USD.
    const expense = await prisma.expense.create({
      data: {
        tripId,
        paidById: users[0],
        name: 'Shared Thai dinner',
        amount: D('10.5'),
        originalAmount: D('300'),
        originalCurrency: Currency.THB,
        exchangeRate: D('0.035'),
        shares: {
          create: [
            { userId: users[0], shareAmount: D('3.5') },
            { userId: users[1], shareAmount: D('3.5') },
            { userId: users[2], shareAmount: D('3.5') },
          ],
        },
      },
    });

    await service.removeMember(tripId, users[2], users[0]);
    await service.updateTrip(tripId, users[0], {
      currency: Currency.VND,
    } as any);

    const migrated = await prisma.expense.findUniqueOrThrow({
      where: { id: expense.id },
      include: { shares: { orderBy: { id: 'asc' } } },
    });
    // 7.00 USD (reduced total) × 25000 — NOT 300 THB × 875 = 262500, which
    // would have resurrected the removed member's 3.50.
    expect(migrated.amount.equals(D('175000'))).toBe(true);
    expect(migrated.shares).toHaveLength(2);
    const shareSum = migrated.shares.reduce(
      (acc, s) => acc.add(s.shareAmount),
      D(0),
    );
    expect(shareSum.equals(migrated.amount)).toBe(true);
  });
});
