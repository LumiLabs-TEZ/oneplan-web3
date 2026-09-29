import { InviteStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TripActivityService } from '../trip-activity/trip-activity.service';
import { StorageService } from '../storage/storage.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { TripsHandler } from '../realtime/handlers/trips.handler';
import { AnalyticsService } from '../analytics/analytics.service';
import { ExpensesService } from './expenses.service';

/**
 * Pairwise (your-POV) settlement: "receive from X" = X's shares on expenses YOU
 * paid; "pay X" = your shares on expenses X paid.
 */
describe('ExpensesService — pairwise settlements', () => {
  const ME = 1;
  const X = 2; // I paid, X owes me (receivable)
  const Y = 3; // Y paid, I owe Y (payable)

  let service: ExpensesService;
  let prisma: {
    tripMember: { findUnique: jest.Mock };
    expense: { findMany: jest.Mock };
    budget: { findMany: jest.Mock };
    expenseShare: { updateMany: jest.Mock };
  };
  let tripsHandler: { sendTripSettlementUpdated: jest.Mock };
  let activityService: { log: jest.Mock };

  const user = (id: number) => ({
    id,
    displayName: `User${id}`,
    avatarUrl: null,
  });

  // Expense A: I paid; X owes 1000 (unsettled), Y owes 500 (settled).
  // Expense B: Y paid; I owe 700 (unsettled).
  // Expense C: paid by the GROUP wallet (paidBy null); my share 400 (unsettled).
  const expenses = [
    {
      id: 10,
      name: 'Dinner',
      paidBy: user(ME),
      shares: [
        { id: 100, user: user(X), shareAmount: 1000, isSettled: false },
        { id: 101, user: user(Y), shareAmount: 500, isSettled: true },
        { id: 102, user: user(ME), shareAmount: 300, isSettled: false },
      ],
    },
    {
      id: 11,
      name: 'Homestay',
      paidBy: user(Y),
      shares: [
        { id: 110, user: user(ME), shareAmount: 700, isSettled: false },
        { id: 111, user: user(Y), shareAmount: 200, isSettled: false },
      ],
    },
    {
      id: 12,
      name: 'Group taxi',
      paidBy: null,
      shares: [
        { id: 120, user: user(ME), shareAmount: 400, isSettled: false },
        { id: 121, user: user(X), shareAmount: 400, isSettled: false },
      ],
    },
  ];

  // GROUP budget: I deposited 1000 (paid). Net vs group = 1000 - 400 = 600.
  const groupBudgets = [
    {
      scope: 'GROUP',
      payments: [
        { userId: ME, amount: 1000, isPaid: true },
        { userId: X, amount: 1000, isPaid: true },
      ],
    },
  ];

  beforeEach(() => {
    prisma = {
      tripMember: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ inviteStatus: InviteStatus.ACCEPTED }),
      },
      expense: { findMany: jest.fn().mockResolvedValue(expenses) },
      budget: { findMany: jest.fn().mockResolvedValue(groupBudgets) },
      expenseShare: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    tripsHandler = { sendTripSettlementUpdated: jest.fn() };
    activityService = { log: jest.fn() };

    service = new ExpensesService(
      prisma as unknown as PrismaService,
      activityService as unknown as TripActivityService,
      {} as StorageService,
      {} as ExchangeRatesService,
      tripsHandler as unknown as TripsHandler,
      {} as AnalyticsService,
      {
        onExpenseAdded: jest.fn(),
        onQualifyingAction: jest.fn(),
        onTripPossiblySettled: jest.fn(),
      } as any,
    );
  });

  it('partitions receivables and payables from the caller POV', async () => {
    const result = await service.getTripSettlements(42, ME);

    // Person rows only (exclude the synthetic Group row). One row per person.
    const persons = result.settlements.filter((s) => !s.isGroup);
    expect(persons).toHaveLength(2); // X and Y, each netted to a single row

    // X: owes me 1000 (Dinner), I owe X nothing → net receive 1000.
    const rowX = persons.find((s) => s.counterpartyUserId === X)!;
    expect(rowX.direction).toBe('receive');
    expect(rowX.totalAmount).toBe(1000); // group taxi excluded
    expect(rowX.isSettled).toBe(false);

    // Y: owes me 500 (Dinner) but I owe Y 700 (Homestay) → net PAY 200.
    const rowY = persons.find((s) => s.counterpartyUserId === Y)!;
    expect(rowY.direction).toBe('pay');
    expect(rowY.totalAmount).toBe(200); // |500 - 700|
    // Both directions' items are present, tagged by owedToYou.
    expect(rowY.items).toHaveLength(2);
    expect(rowY.items.find((i) => i.expenseName === 'Dinner')!.owedToYou).toBe(
      true,
    );
    expect(
      rowY.items.find((i) => i.expenseName === 'Homestay')!.owedToYou,
    ).toBe(false);
  });

  it('adds a Group row = my deposits − my group-paid consumption', async () => {
    const result = await service.getTripSettlements(42, ME);

    const group = result.settlements.find((s) => s.isGroup)!;
    expect(group).toBeDefined();
    expect(group.counterpartyUserId).toBe(0);
    expect(group.displayName).toBe('Group');
    // deposits 1000 − group consumption 400 = 600 → wallet refunds me.
    expect(group.direction).toBe('receive');
    expect(group.totalAmount).toBe(600);
    expect(group.isSettled).toBe(false);
    // Items are only my share(s) of null-payer expenses.
    expect(group.items).toHaveLength(1);
    expect(group.items[0].expenseName).toBe('Group taxi');
    expect(group.items[0].shareAmount).toBe(400);
    // Group row is listed first.
    expect(result.settlements[0].isGroup).toBe(true);
  });

  it('settle Group targets my shares of null-payer expenses only', async () => {
    await service.settleCounterparty(42, ME, {
      counterpartyUserId: 0,
      direction: 'receive',
      isGroup: true,
    });

    expect(prisma.expenseShare.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: ME,
          isSettled: false,
          expense: { tripId: 42, paidById: null },
        },
        data: expect.objectContaining({ isSettled: true }),
      }),
    );
  });

  it('settling a person settles BOTH directions with that counterparty', async () => {
    await service.settleCounterparty(42, ME, {
      counterpartyUserId: Y,
      direction: 'pay',
    });

    expect(prisma.expenseShare.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isSettled: false,
          OR: [
            { userId: ME, expense: { tripId: 42, paidById: Y } },
            { userId: Y, expense: { tripId: 42, paidById: ME } },
          ],
        },
        data: expect.objectContaining({ isSettled: true }),
      }),
    );
    expect(tripsHandler.sendTripSettlementUpdated).toHaveBeenCalledWith(42);
  });

  it('rejects non-members', async () => {
    prisma.tripMember.findUnique.mockResolvedValue(null);
    await expect(service.getTripSettlements(42, ME)).rejects.toThrow(
      'not a member',
    );
  });

  it('produces no counterparty rows when all shares belong to the payer', async () => {
    prisma.expense.findMany.mockResolvedValue([
      {
        id: 20,
        name: 'Solo lunch',
        paidBy: user(ME),
        shares: [
          { id: 200, user: user(ME), shareAmount: 500, isSettled: false },
        ],
      },
    ]);
    prisma.budget.findMany.mockResolvedValue([]);

    const result = await service.getTripSettlements(42, ME);

    expect(result.settlements.filter((s) => !s.isGroup)).toHaveLength(0);
  });

  it('pairwise nets stay zero-sum on a post-migration dataset', async () => {
    // Shape produced by a currency migration: every share scaled by the same
    // rate with the rounding residual pushed onto the largest share. The
    // pairwise nets from opposite POVs must mirror exactly.
    // Original: Dinner 10.00 paid by ME, shares X 3.33 / Y 3.33 / ME 3.34.
    // Migrated at 0.11 → amount 1.10, shares 0.37 / 0.37 / 0.36 (residual
    // -0.01 on ME's largest share).
    const migrated = [
      {
        id: 30,
        name: 'Dinner',
        paidBy: user(ME),
        shares: [
          { id: 300, user: user(X), shareAmount: 0.37, isSettled: false },
          { id: 301, user: user(Y), shareAmount: 0.37, isSettled: false },
          { id: 302, user: user(ME), shareAmount: 0.36, isSettled: false },
        ],
      },
    ];
    prisma.expense.findMany.mockResolvedValue(migrated);
    prisma.budget.findMany.mockResolvedValue([]);

    const mine = await service.getTripSettlements(42, ME);
    const theirsX = await service.getTripSettlements(42, X);

    const myRowX = mine.settlements.find((s) => s.counterpartyUserId === X)!;
    const xRowMe = theirsX.settlements.find(
      (s) => s.counterpartyUserId === ME,
    )!;
    expect(myRowX.direction).toBe('receive');
    expect(xRowMe.direction).toBe('pay');
    expect(myRowX.totalAmount).toBe(xRowMe.totalAmount);
    expect(myRowX.totalAmount).toBeCloseTo(0.37, 10);
  });

  it('keeps the Group row consistent when deposits and consumption were migrated with the same rate', async () => {
    // Deposit 1000 and group share 400 both scaled by 0.11 → 110 / 44.
    prisma.expense.findMany.mockResolvedValue([
      {
        id: 40,
        name: 'Group taxi',
        paidBy: null,
        shares: [
          { id: 400, user: user(ME), shareAmount: 44, isSettled: false },
        ],
      },
    ]);
    prisma.budget.findMany.mockResolvedValue([
      {
        scope: 'GROUP',
        payments: [{ userId: ME, amount: 110, isPaid: true }],
      },
    ]);

    const result = await service.getTripSettlements(42, ME);

    const group = result.settlements.find((s) => s.isGroup)!;
    expect(group.direction).toBe('receive');
    expect(group.totalAmount).toBeCloseTo(66, 10);
  });
});
