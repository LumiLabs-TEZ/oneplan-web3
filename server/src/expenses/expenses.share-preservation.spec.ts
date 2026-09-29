import { InviteStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TripActivityService } from '../trip-activity/trip-activity.service';
import { StorageService } from '../storage/storage.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { TripsHandler } from '../realtime/handlers/trips.handler';
import { AnalyticsService } from '../analytics/analytics.service';
import { MissionsService } from '../missions/missions.service';
import { ExpensesService } from './expenses.service';

/**
 * Bug 2: an amount-only edit must preserve an expense's existing (possibly
 * uneven) share distribution instead of silently re-splitting it equally.
 *
 * Bug 3: the split remainder must land on a deterministic member — the
 * lowest trip_member id — not whichever row an unordered query happens to
 * return first.
 */
describe('ExpensesService — share preservation on edit', () => {
  const user = (id: number) => ({
    id,
    displayName: `User${id}`,
    avatarUrl: null,
  });

  let service: ExpensesService;
  let prisma: {
    tripMember: { findUnique: jest.Mock; findMany: jest.Mock };
    trip: { findUniqueOrThrow: jest.Mock };
    expense: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: {
    expense: {
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
    tripMember: { findMany: jest.Mock };
    expenseShare: {
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      createMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let activityService: { log: jest.Mock };

  beforeEach(() => {
    tx = {
      expense: {
        findUniqueOrThrow: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn(),
      },
      tripMember: { findMany: jest.fn() },
      expenseShare: {
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    prisma = {
      tripMember: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ inviteStatus: InviteStatus.ACCEPTED }),
        findMany: jest.fn(),
      },
      trip: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ currency: 'USD' }),
      },
      expense: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 1, name: 'Receipt', tripId: 1 }),
        findUniqueOrThrow: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    };

    activityService = { log: jest.fn() };

    service = new ExpensesService(
      prisma as unknown as PrismaService,
      activityService as unknown as TripActivityService,
      {} as StorageService,
      {} as ExchangeRatesService,
      {} as TripsHandler,
      { track: jest.fn() } as unknown as AnalyticsService,
      { onExpenseAdded: jest.fn() } as unknown as MissionsService,
    );
  });

  // Stub out findExpenseDetail's DB round-trip; its exact shape isn't what
  // these tests are pinning down (that's covered by other expense specs).
  const stubDetailFetch = () => {
    prisma.expense.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      tripId: 1,
      name: 'Receipt',
      amount: 0,
      category: 'OTHER',
      note: null,
      receiptUrl: null,
      expenseDate: new Date(),
      createdAt: new Date(),
      paidBy: user(1),
      shares: [],
    });
  };

  describe('Bug 2 — amount-only edit preserves the existing distribution', () => {
    it('scales uneven shares proportionally instead of re-splitting equally', async () => {
      // Existing uneven split from a receipt scan: 10.00 / 20.00 on a 30.00 expense.
      tx.expense.findUniqueOrThrow.mockResolvedValue({ amount: 30 });
      tx.expenseShare.findMany.mockResolvedValue([
        { id: 201, shareAmount: 10 },
        { id: 202, shareAmount: 20 },
      ]);
      stubDetailFetch();

      // Amount-only edit: doubles the total, memberIds untouched.
      await service.updateExpense(1, 1, 1, { amount: 60 });

      expect(tx.expenseShare.update).toHaveBeenCalledTimes(2);
      expect(tx.expenseShare.update).toHaveBeenNthCalledWith(1, {
        where: { id: 201 },
        data: { shareAmount: 20 }, // 10 * (60/30)
      });
      expect(tx.expenseShare.update).toHaveBeenNthCalledWith(2, {
        where: { id: 202 },
        data: { shareAmount: 40 }, // 20 * (60/30)
      });

      // Must NOT have flattened to an equal split (30/30).
      expect(tx.expenseShare.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: { shareAmount: 30 } }),
      );

      // memberIds untouched: the membership-diff query must never run.
      expect(tx.tripMember.findMany).not.toHaveBeenCalled();
    });

    it('leaves shares untouched when neither amount nor memberIds changed', async () => {
      tx.expense.findUniqueOrThrow.mockResolvedValue({ amount: 30 });
      stubDetailFetch();

      await service.updateExpense(1, 1, 1, { name: 'Renamed' });

      expect(tx.expenseShare.findMany).not.toHaveBeenCalled();
      expect(tx.expenseShare.update).not.toHaveBeenCalled();
    });
  });

  describe('Bug 3 — remainder recipient is deterministic', () => {
    it('createExpense: splits the odd cent to the lowest trip_member id, and orders the member query', async () => {
      // trip_member.id=10 (userId=3) is the lowest member id; returned
      // first because the query is now explicitly ordered.
      prisma.tripMember.findMany.mockResolvedValue([
        { id: 10, userId: 3 },
        { id: 11, userId: 5 },
      ]);
      tx.expense.create.mockResolvedValue({ id: 1 });
      stubDetailFetch();

      await service.createExpense(1, 3, {
        name: 'Snacks',
        amount: 10.01,
        memberIds: [5, 3], // caller-supplied order must not matter
        expenseDate: new Date().toISOString(),
      } as never);

      expect(prisma.tripMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { id: 'asc' } }),
      );

      expect(tx.expenseShare.createMany).toHaveBeenCalledWith({
        data: [
          { expenseId: 1, userId: 3, shareAmount: 5.01 },
          { expenseId: 1, userId: 5, shareAmount: 5 },
        ],
      });
    });

    it('updateExpense: orders the membership-diff query deterministically', async () => {
      tx.expense.findUniqueOrThrow.mockResolvedValue({ amount: 10.01 });
      tx.tripMember.findMany.mockResolvedValue([{ userId: 3 }, { userId: 5 }]);
      tx.expenseShare.findMany
        .mockResolvedValueOnce([{ id: 301, userId: 3 }]) // existing shares (pre-diff)
        .mockResolvedValueOnce([
          { id: 301, userId: 3 },
          { id: 302, userId: 5 },
        ]); // post-diff, ordered by id asc
      stubDetailFetch();

      await service.updateExpense(1, 1, 1, { memberIds: [5, 3] });

      expect(tx.tripMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { id: 'asc' } }),
      );
      expect(tx.expenseShare.update).toHaveBeenNthCalledWith(1, {
        where: { id: 301 },
        data: { shareAmount: 5.01 },
      });
      expect(tx.expenseShare.update).toHaveBeenNthCalledWith(2, {
        where: { id: 302 },
        data: { shareAmount: 5 },
      });
    });
  });
});
