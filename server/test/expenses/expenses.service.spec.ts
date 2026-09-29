import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Currency, InviteStatus, Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ExchangeRatesService } from '../../src/exchange-rates/exchange-rates.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { StorageService } from '../../src/storage/storage.service';
import { TripActivityService } from '../../src/trip-activity/trip-activity.service';
import { ExpensesService } from '../../src/expenses/expenses.service';
import { CreateExpenseDto } from '../../src/expenses/dto/create-expense.dto';
import { CreateReceiptExpenseDto } from '../../src/expenses/dto/create-receipt-expense.dto';
import { UpdateExpenseDto } from '../../src/expenses/dto/update-expense.dto';

describe('ExpensesService', () => {
  let service: ExpensesService;
  let prisma: Record<string, any>;
  let activityService: Record<string, any>;
  let storageService: Record<string, any>;
  let exchangeRates: Record<string, any>;
  let tripsHandler: Record<string, any>;

  const mockUser = {
    id: 1,
    displayName: 'Test User',
    avatarUrl: null,
  };

  const mockUser2 = {
    id: 2,
    displayName: 'User Two',
    avatarUrl: 'https://example.com/avatar.jpg',
  };

  const mockMember = {
    id: 1,
    tripId: 1,
    userId: 1,
    inviteStatus: InviteStatus.ACCEPTED,
    joinedAt: new Date(),
  };

  const mockExpense = {
    id: 1,
    tripId: 1,
    paidById: 1,
    name: 'Dinner',
    amount: { toNumber: () => 30 },
    category: 'FOOD',
    note: 'Thai food',
    receiptUrl: null,
    expenseDate: new Date('2026-03-18'),
    createdAt: new Date('2026-03-18'),
    updatedAt: new Date('2026-03-18'),
  };

  const mockExpenseWithIncludes = {
    ...mockExpense,
    paidBy: { id: 1, displayName: 'Test User', avatarUrl: null },
    shares: [
      {
        id: 1,
        expenseId: 1,
        userId: 1,
        shareAmount: { toNumber: () => 10 },
        isSettled: false,
        settledAt: null,
        user: { id: 1, displayName: 'Test User', avatarUrl: null },
      },
      {
        id: 2,
        expenseId: 1,
        userId: 2,
        shareAmount: { toNumber: () => 10 },
        isSettled: false,
        settledAt: null,
        user: {
          id: 2,
          displayName: 'User Two',
          avatarUrl: 'https://example.com/avatar.jpg',
        },
      },
      {
        id: 3,
        expenseId: 1,
        userId: 3,
        shareAmount: { toNumber: () => 10 },
        isSettled: false,
        settledAt: null,
        user: { id: 3, displayName: 'User Three', avatarUrl: null },
      },
    ],
  };

  beforeEach(() => {
    prisma = {
      expense: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      expenseShare: {
        create: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      tripMember: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      trip: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ currency: Currency.VND }),
      },
      $transaction: jest.fn((cb: (tx: any) => Promise<any>) => cb(prisma)),
    };

    activityService = { log: jest.fn() };
    storageService = {
      getSignedThumbUrl: jest.fn(async (objectKey: string) => ({
        url: `https://signed.example.com/${objectKey}`,
      })),
    };
    exchangeRates = {
      // Reject by default so any unintended conversion fails loudly. Tests
      // that exercise the conversion path override this with mockResolvedValue.
      getRate: jest
        .fn()
        .mockRejectedValue(
          new Error('getRate should not be called on this path'),
        ),
      convertToHome: jest.fn(),
    };
    tripsHandler = {
      sendTripSettlementUpdated: jest.fn(),
    };

    service = new ExpensesService(
      prisma as unknown as PrismaService,
      activityService as unknown as TripActivityService,
      storageService as unknown as StorageService,
      exchangeRates as unknown as ExchangeRatesService,
      tripsHandler as any,
      { track: jest.fn() } as any,
      {
        onExpenseAdded: jest.fn(),
        onQualifyingAction: jest.fn(),
        onTripPossiblySettled: jest.fn(),
      } as any,
    );
  });

  describe('createExpense', () => {
    it('should create an expense with equal shares for specified members', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.tripMember.findMany.mockResolvedValue([
        { userId: 1 },
        { userId: 2 },
        { userId: 3 },
      ]);
      prisma.expense.create.mockResolvedValue(mockExpense);
      prisma.expenseShare.createMany.mockResolvedValue({ count: 3 });
      prisma.expense.findUniqueOrThrow.mockResolvedValue(
        mockExpenseWithIncludes,
      );

      const result = await service.createExpense(1, 1, {
        name: 'Dinner',
        amount: 30,
        memberIds: [1, 2, 3],
        expenseDate: '2026-03-18',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      const createArgs = prisma.expense.create.mock.calls[0][0];
      expect(createArgs.data.tripId).toBe(1);
      expect(createArgs.data.paidById).toBe(1);
      expect(createArgs.data.name).toBe('Dinner');
      expect(createArgs.data.category).toBe('OTHER');
      expect(Number(createArgs.data.amount)).toBe(30);
      const createManyArgs = prisma.expenseShare.createMany.mock.calls[0][0];
      const shareAmounts = createManyArgs.data.map((d: any) =>
        Number(d.shareAmount),
      );
      expect(shareAmounts).toEqual([10, 10, 10]);
      const shareUserIds = createManyArgs.data.map((d: any) => d.userId);
      expect(shareUserIds).toEqual(expect.arrayContaining([1, 2, 3]));
      expect(result.id).toBe(1);
      expect(result.shares).toHaveLength(3);
    });

    it('records an explicit paidById when that member is accepted', async () => {
      // findUnique serves both assertMember (caller) and resolvePayer (payer).
      prisma.tripMember.findUnique.mockImplementation((args: any) =>
        Promise.resolve({
          userId: args.where.tripId_userId.userId,
          inviteStatus: InviteStatus.ACCEPTED,
        }),
      );
      prisma.tripMember.findMany.mockResolvedValue([
        { userId: 1 },
        { userId: 2 },
      ]);
      prisma.expense.create.mockResolvedValue(mockExpense);
      prisma.expenseShare.createMany.mockResolvedValue({ count: 2 });
      prisma.expense.findUniqueOrThrow.mockResolvedValue(
        mockExpenseWithIncludes,
      );

      await service.createExpense(1, 1, {
        name: 'Dinner',
        amount: 30,
        memberIds: [1, 2],
        expenseDate: '2026-03-18',
        paidById: 2,
      });

      expect(prisma.expense.create.mock.calls[0][0].data.paidById).toBe(2);
    });

    it('rejects a paidById who is not an accepted member', async () => {
      prisma.tripMember.findUnique.mockImplementation((args: any) => {
        const { userId } = args.where.tripId_userId;
        if (userId === 1) {
          return Promise.resolve({
            userId,
            inviteStatus: InviteStatus.ACCEPTED,
          });
        }
        // Pending member and non-member alike must be refused.
        return Promise.resolve(
          userId === 2 ? { userId, inviteStatus: InviteStatus.PENDING } : null,
        );
      });
      prisma.tripMember.findMany.mockResolvedValue([{ userId: 1 }]);

      await expect(
        service.createExpense(1, 1, {
          name: 'Dinner',
          amount: 30,
          memberIds: [1],
          expenseDate: '2026-03-18',
          paidById: 2,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createExpense(1, 1, {
          name: 'Dinner',
          amount: 30,
          memberIds: [1],
          expenseDate: '2026-03-18',
          paidById: 999,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create an expense with a single member', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.tripMember.findMany.mockResolvedValue([{ userId: 1 }]);
      prisma.expense.create.mockResolvedValue(mockExpense);
      prisma.expenseShare.createMany.mockResolvedValue({ count: 1 });
      prisma.expense.findUniqueOrThrow.mockResolvedValue({
        ...mockExpenseWithIncludes,
        shares: [mockExpenseWithIncludes.shares[0]],
      });

      const result = await service.createExpense(1, 1, {
        name: 'Dinner',
        amount: 30,
        memberIds: [1],
        expenseDate: '2026-03-18',
      });

      const singleMemberArgs = prisma.expenseShare.createMany.mock.calls[0][0];
      expect(singleMemberArgs.data).toHaveLength(1);
      expect(singleMemberArgs.data[0].userId).toBe(1);
      expect(Number(singleMemberArgs.data[0].shareAmount)).toBe(30);
      expect(result.shares).toHaveLength(1);
    });

    it('should silently filter out non-accepted members and split among accepted ones', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.tripMember.findMany.mockResolvedValue([{ userId: 1 }]);
      prisma.expense.create.mockResolvedValue(mockExpense);
      prisma.expenseShare.createMany.mockResolvedValue({ count: 1 });
      prisma.expense.findUniqueOrThrow.mockResolvedValue({
        ...mockExpenseWithIncludes,
        shares: [mockExpenseWithIncludes.shares[0]],
      });

      const result = await service.createExpense(1, 1, {
        name: 'Dinner',
        amount: 30,
        memberIds: [1, 999],
        expenseDate: '2026-03-18',
      });

      const filteredArgs = prisma.expenseShare.createMany.mock.calls[0][0];
      expect(filteredArgs.data).toHaveLength(1);
      expect(filteredArgs.data[0].userId).toBe(1);
      expect(Number(filteredArgs.data[0].shareAmount)).toBe(30);
      expect(result.shares).toHaveLength(1);
    });

    it('should throw BadRequestException when no accepted members found', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.tripMember.findMany.mockResolvedValue([]);

      await expect(
        service.createExpense(1, 1, {
          name: 'Dinner',
          amount: 30,
          memberIds: [999],
          expenseDate: '2026-03-18',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ForbiddenException when user is not a member', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(null);

      await expect(
        service.createExpense(1, 99, {
          name: 'Dinner',
          amount: 30,
          expenseDate: '2026-03-18',
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('persists originalCurrency = trip.currency and exchangeRate = 1 when only amount is given', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.tripMember.findMany.mockResolvedValue([{ userId: 1 }]);
      prisma.trip.findUniqueOrThrow.mockResolvedValue({
        currency: Currency.VND,
      });
      prisma.expense.create.mockResolvedValue(mockExpense);
      prisma.expenseShare.createMany.mockResolvedValue({ count: 1 });
      prisma.expense.findUniqueOrThrow.mockResolvedValue({
        ...mockExpenseWithIncludes,
        originalAmount: new Prisma.Decimal(30),
        originalCurrency: Currency.VND,
        exchangeRate: new Prisma.Decimal(1),
        shares: [mockExpenseWithIncludes.shares[0]],
      });

      const result = await service.createExpense(1, 1, {
        name: 'Dinner',
        amount: 30,
        memberIds: [1],
        expenseDate: '2026-03-18',
      });

      expect(exchangeRates.getRate).not.toHaveBeenCalled();

      const createArgs = prisma.expense.create.mock.calls[0][0];
      expect(createArgs.data.originalCurrency).toBe(Currency.VND);
      expect(createArgs.data.exchangeRate.toString()).toBe('1');
      expect(createArgs.data.originalAmount.toString()).toBe('30');
      expect(createArgs.data.amount.toString()).toBe('30');

      expect(result.originalCurrency).toBe(Currency.VND);
      expect(result.exchangeRate).toBe(1);
      expect(result.rateStale).toBeUndefined();
    });

    it('converts via rates.getRate when originalAmount + originalCurrency differ from trip currency', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.tripMember.findMany.mockResolvedValue([{ userId: 1 }]);
      prisma.trip.findUniqueOrThrow.mockResolvedValue({
        currency: Currency.VND,
      });
      exchangeRates.getRate.mockResolvedValue({
        rate: new Prisma.Decimal('600'),
        fetchedAt: new Date(),
        isStale: false,
      });
      prisma.expense.create.mockResolvedValue(mockExpense);
      prisma.expenseShare.createMany.mockResolvedValue({ count: 1 });
      prisma.expense.findUniqueOrThrow.mockResolvedValue({
        ...mockExpenseWithIncludes,
        originalAmount: new Prisma.Decimal('30'),
        originalCurrency: Currency.THB,
        exchangeRate: new Prisma.Decimal('600'),
        shares: [mockExpenseWithIncludes.shares[0]],
      });

      const result = await service.createExpense(1, 1, {
        name: 'Street Food',
        amount: 30,
        memberIds: [1],
        expenseDate: '2026-03-18',
        originalAmount: 30,
        originalCurrency: Currency.THB,
      } as any);

      expect(exchangeRates.getRate).toHaveBeenCalledWith(
        Currency.THB,
        Currency.VND,
      );

      const createArgs = prisma.expense.create.mock.calls[0][0];
      expect(createArgs.data.amount.toString()).toBe('18000');
      expect(createArgs.data.originalCurrency).toBe(Currency.THB);
      expect(createArgs.data.originalAmount.toString()).toBe('30');
      expect(createArgs.data.exchangeRate.toString()).toBe('600');

      expect(result.originalCurrency).toBe(Currency.THB);
      expect(result.exchangeRate).toBe(600);
    });

    it('rounds the converted amount to 2dp and splits shares that sum to it exactly', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.tripMember.findMany.mockResolvedValue([
        { userId: 1 },
        { userId: 2 },
        { userId: 3 },
      ]);
      prisma.trip.findUniqueOrThrow.mockResolvedValue({
        currency: Currency.USD,
      });
      // 10.001 THB-ish → USD at rate 1: unrounded 10.001 vs stored 10.00.
      exchangeRates.getRate.mockResolvedValue({
        rate: new Prisma.Decimal('1'),
        fetchedAt: new Date(),
        isStale: false,
      });
      prisma.expense.create.mockResolvedValue(mockExpense);
      prisma.expenseShare.createMany.mockResolvedValue({ count: 3 });
      prisma.expense.findUniqueOrThrow.mockResolvedValue(
        mockExpenseWithIncludes,
      );

      await service.createExpense(1, 1, {
        name: 'Odd amount',
        amount: 10,
        memberIds: [1, 2, 3],
        expenseDate: '2026-03-18',
        originalAmount: 10.001,
        originalCurrency: Currency.THB,
      } as any);

      const createArgs = prisma.expense.create.mock.calls[0][0];
      // Stored amount is the 2dp value, matching the Decimal(18,2) column.
      expect(createArgs.data.amount.toString()).toBe('10');
      const shares = prisma.expenseShare.createMany.mock.calls[0][0].data;
      const shareSum = shares.reduce(
        (acc: number, s: any) => acc + Number(s.shareAmount),
        0,
      );
      expect(shareSum).toBeCloseTo(10, 10);
    });

    it('stores 10.01 (not 10.00) at the half-cent boundary and shares sum to it', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.tripMember.findMany.mockResolvedValue([
        { userId: 1 },
        { userId: 2 },
      ]);
      prisma.trip.findUniqueOrThrow.mockResolvedValue({
        currency: Currency.USD,
      });
      // 2.001 × 5 = 10.005 → Decimal half-up rounds to 10.01. Before the
      // resolveAmounts rounding fix, JS Number(10.005) truncated share math
      // to 10.00 while Postgres stored 10.01 — a one-cent invariant break.
      exchangeRates.getRate.mockResolvedValue({
        rate: new Prisma.Decimal('5'),
        fetchedAt: new Date(),
        isStale: false,
      });
      prisma.expense.create.mockResolvedValue(mockExpense);
      prisma.expenseShare.createMany.mockResolvedValue({ count: 2 });
      prisma.expense.findUniqueOrThrow.mockResolvedValue(
        mockExpenseWithIncludes,
      );

      await service.createExpense(1, 1, {
        name: 'Boundary',
        amount: 10,
        memberIds: [1, 2],
        expenseDate: '2026-03-18',
        originalAmount: 2.001,
        originalCurrency: Currency.THB,
      } as any);

      const createArgs = prisma.expense.create.mock.calls[0][0];
      expect(createArgs.data.amount.toString()).toBe('10.01');
      const shares = prisma.expenseShare.createMany.mock.calls[0][0].data;
      const shareSum = shares.reduce(
        (acc: number, s: any) => acc + Number(s.shareAmount),
        0,
      );
      expect(shareSum).toBeCloseTo(10.01, 10);
    });
  });

  describe('createReceiptExpense', () => {
    const baseDto = (
      items: Array<{ name: string; amount: number; userId: number }>,
      originalCurrency?: Currency,
    ) =>
      ({
        name: 'Receipt',
        expenseDate: '2026-03-18',
        items,
        ...(originalCurrency ? { originalCurrency } : {}),
      }) as CreateReceiptExpenseDto;

    const sumShares = () =>
      prisma.expenseShare.createMany.mock.calls[0][0].data.reduce(
        (acc: number, d: any) => acc + Number(d.shareAmount),
        0,
      );

    beforeEach(() => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expense.create.mockResolvedValue(mockExpense);
      prisma.expenseShare.createMany.mockResolvedValue({ count: 2 });
      prisma.expense.findUniqueOrThrow.mockResolvedValue(
        mockExpenseWithIncludes,
      );
    });

    it('stores trip currency + rate 1 and never calls getRate when no originalCurrency', async () => {
      prisma.tripMember.findMany.mockResolvedValue([
        { userId: 1 },
        { userId: 2 },
      ]);
      prisma.trip.findUniqueOrThrow.mockResolvedValue({
        currency: Currency.VND,
      });

      const result = await service.createReceiptExpense(
        1,
        1,
        baseDto([
          { name: 'Pho', amount: 10000, userId: 1 },
          { name: 'Tea', amount: 5000, userId: 2 },
        ]),
      );

      expect(exchangeRates.getRate).not.toHaveBeenCalled();
      const data = prisma.expense.create.mock.calls[0][0].data;
      expect(data.amount.toString()).toBe('15000');
      expect(data.originalAmount.toString()).toBe('15000');
      expect(data.originalCurrency).toBe(Currency.VND);
      expect(data.exchangeRate.toString()).toBe('1');
      expect(sumShares()).toBe(15000);
      expect(result.rateStale).toBeUndefined();
    });

    it('treats originalCurrency === trip currency as same-currency (no getRate)', async () => {
      prisma.tripMember.findMany.mockResolvedValue([{ userId: 1 }]);
      prisma.trip.findUniqueOrThrow.mockResolvedValue({
        currency: Currency.VND,
      });

      await service.createReceiptExpense(
        1,
        1,
        baseDto([{ name: 'Pho', amount: 12000, userId: 1 }], Currency.VND),
      );

      expect(exchangeRates.getRate).not.toHaveBeenCalled();
      const data = prisma.expense.create.mock.calls[0][0].data;
      expect(data.amount.toString()).toBe('12000');
      expect(data.originalCurrency).toBe(Currency.VND);
      expect(data.exchangeRate.toString()).toBe('1');
    });

    it('converts a foreign receipt currency to trip currency and shares sum exactly to the converted total', async () => {
      prisma.tripMember.findMany.mockResolvedValue([
        { userId: 1 },
        { userId: 2 },
      ]);
      prisma.trip.findUniqueOrThrow.mockResolvedValue({
        currency: Currency.VND,
      });
      exchangeRates.getRate.mockResolvedValue({
        rate: new Prisma.Decimal('600'),
        fetchedAt: new Date(),
        isStale: false,
      });

      await service.createReceiptExpense(
        1,
        1,
        baseDto(
          [
            { name: 'Pad Thai', amount: 10, userId: 1 },
            { name: 'Beer', amount: 20, userId: 2 },
          ],
          Currency.THB,
        ),
      );

      expect(exchangeRates.getRate).toHaveBeenCalledWith(
        Currency.THB,
        Currency.VND,
      );
      const data = prisma.expense.create.mock.calls[0][0].data;
      expect(data.amount.toString()).toBe('18000');
      expect(data.originalAmount.toString()).toBe('30');
      expect(data.originalCurrency).toBe(Currency.THB);
      expect(data.exchangeRate.toString()).toBe('600');
      expect(sumShares()).toBe(18000);
    });

    it('reconciles sub-cent rounding so converted shares sum EXACTLY to the converted total', async () => {
      prisma.tripMember.findMany.mockResolvedValue([
        { userId: 1 },
        { userId: 2 },
        { userId: 3 },
      ]);
      prisma.trip.findUniqueOrThrow.mockResolvedValue({
        currency: Currency.USD,
      });
      exchangeRates.getRate.mockResolvedValue({
        rate: new Prisma.Decimal('0.0814'),
        fetchedAt: new Date(),
        isStale: false,
      });

      await service.createReceiptExpense(
        1,
        1,
        baseDto(
          [
            { name: 'A', amount: 10, userId: 1 },
            { name: 'B', amount: 10, userId: 2 },
            { name: 'C', amount: 10, userId: 3 },
          ],
          Currency.THB,
        ),
      );

      // 30 * 0.0814 = 2.442 → 2.44; each 10*0.0814=0.814→0.81 (sum 2.43);
      // residual 0.01 lands on one share → exact sum 2.44.
      const shareAmounts = prisma.expenseShare.createMany.mock.calls[0][0].data
        .map((d: any) => Number(d.shareAmount))
        .sort();
      expect(shareAmounts).toEqual([0.81, 0.81, 0.82]);
      expect(sumShares()).toBeCloseTo(2.44, 10);
    });

    it('stores the 2dp-rounded converted total at a half-cent boundary and shares sum to it', async () => {
      prisma.tripMember.findMany.mockResolvedValue([
        { userId: 1 },
        { userId: 2 },
      ]);
      prisma.trip.findUniqueOrThrow.mockResolvedValue({
        currency: Currency.USD,
      });
      // Total 30 THB × 0.3335 = 10.005 → Decimal half-up 10.01. Pre-fix,
      // Number math saw 10.004999… and reconciled shares to 10.00 while
      // the column stored 10.01.
      exchangeRates.getRate.mockResolvedValue({
        rate: new Prisma.Decimal('0.3335'),
        fetchedAt: new Date(),
        isStale: false,
      });

      await service.createReceiptExpense(
        1,
        1,
        baseDto(
          [
            { name: 'A', amount: 20, userId: 1 },
            { name: 'B', amount: 10, userId: 2 },
          ],
          Currency.THB,
        ),
      );

      const data = prisma.expense.create.mock.calls[0][0].data;
      expect(data.amount.toString()).toBe('10.01');
      expect(sumShares()).toBeCloseTo(10.01, 10);
    });

    it('flags rateStale when the FX rate is stale', async () => {
      prisma.tripMember.findMany.mockResolvedValue([{ userId: 1 }]);
      prisma.trip.findUniqueOrThrow.mockResolvedValue({
        currency: Currency.VND,
      });
      exchangeRates.getRate.mockResolvedValue({
        rate: new Prisma.Decimal('600'),
        fetchedAt: new Date(),
        isStale: true,
      });

      const result = await service.createReceiptExpense(
        1,
        1,
        baseDto([{ name: 'Pad Thai', amount: 10, userId: 1 }], Currency.THB),
      );

      expect(result.rateStale).toBe(true);
    });

    it('throws BadRequestException when an item is assigned to a non-member', async () => {
      prisma.tripMember.findMany.mockResolvedValue([]);
      prisma.trip.findUniqueOrThrow.mockResolvedValue({
        currency: Currency.VND,
      });

      await expect(
        service.createReceiptExpense(
          1,
          1,
          baseDto([{ name: 'Pho', amount: 10000, userId: 999 }]),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('settleAllShares', () => {
    it('broadcasts realtime after settling current user shares', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expenseShare.updateMany.mockResolvedValue({ count: 2 });
      jest.spyOn(service, 'getTripBreakdown').mockResolvedValue({
        totalSpent: 0,
        unsettledCount: 0,
        members: [],
      });

      const result = await service.settleAllShares(1, 1);

      expect(prisma.expenseShare.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 1,
          isSettled: false,
          expense: { tripId: 1 },
        },
        data: {
          isSettled: true,
          settledAt: expect.any(Date),
        },
      });
      expect(tripsHandler.sendTripSettlementUpdated).toHaveBeenCalledWith(1);
      expect(result.unsettledCount).toBe(0);
    });
  });

  describe('listExpenses', () => {
    it('should return expenses for a trip', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expense.findMany.mockResolvedValue([
        {
          ...mockExpense,
          paidBy: { id: 1, displayName: 'Test User', avatarUrl: null },
          shares: [{ user: { id: 1, avatarUrl: null } }],
        },
      ]);

      const result = await service.listExpenses(1, 1, {});

      expect(prisma.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tripId: 1 },
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Dinner');
      expect(result[0].sharedMembers).toHaveLength(1);
    });

    it('should filter by category when provided', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expense.findMany.mockResolvedValue([]);

      await service.listExpenses(1, 1, { category: 'FOOD' as any });

      expect(prisma.expense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: 'FOOD',
          }),
        }),
      );
    });

    it('should throw ForbiddenException when user is not a member', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(null);

      await expect(service.listExpenses(1, 99, {})).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getExpense', () => {
    it('should return expense detail when user is a member', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expense.findUnique.mockResolvedValue(mockExpense);
      prisma.expense.findUniqueOrThrow.mockResolvedValue(
        mockExpenseWithIncludes,
      );

      const result = await service.getExpense(1, 1, 1);

      expect(result.id).toBe(1);
      expect(result.shares).toHaveLength(3);
      expect(result.paidBy.userId).toBe(1);
    });

    it('should throw ForbiddenException when user is not a member', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(null);

      await expect(service.getExpense(1, 1, 99)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException when expense belongs to different trip', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expense.findUnique.mockResolvedValue({
        ...mockExpense,
        tripId: 999,
      });

      await expect(service.getExpense(1, 1, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when expense does not exist', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expense.findUnique.mockResolvedValue(null);

      await expect(service.getExpense(1, 999, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateExpense', () => {
    it('should update expense when user is a member', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expense.findUnique.mockResolvedValue(mockExpense);
      prisma.expense.findUniqueOrThrow.mockResolvedValueOnce({
        amount: { toNumber: () => 30 },
      });
      prisma.expense.update.mockResolvedValue(mockExpense);
      prisma.expense.findUniqueOrThrow.mockResolvedValue(
        mockExpenseWithIncludes,
      );

      const result = await service.updateExpense(1, 1, 1, {
        name: 'Updated Dinner',
      });

      expect(prisma.expense.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({ name: 'Updated Dinner' }),
        }),
      );
      expect(result.id).toBe(1);
    });

    it('should recalculate shares when amount changes (membership also changed)', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expense.findUnique.mockResolvedValue(mockExpense);
      prisma.expense.findUniqueOrThrow.mockResolvedValueOnce({
        amount: { toNumber: () => 30 },
      });
      prisma.expense.update.mockResolvedValue(mockExpense);
      prisma.tripMember.findMany.mockResolvedValue([
        { userId: 1 },
        { userId: 2 },
        { userId: 3 },
      ]);
      prisma.expenseShare.findMany
        .mockResolvedValueOnce([
          { id: 1, userId: 1 },
          { id: 2, userId: 2 },
          { id: 3, userId: 3 },
        ])
        .mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }]);
      prisma.expenseShare.update.mockResolvedValue({});
      prisma.expense.findUniqueOrThrow.mockResolvedValue(
        mockExpenseWithIncludes,
      );

      // Amount AND membership both change here, so the equal-resplit path
      // (not the amount-only proportional-scale path) is the one exercised.
      await service.updateExpense(1, 1, 1, {
        amount: 60,
        memberIds: [1, 2, 3],
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.expenseShare.findMany).toHaveBeenLastCalledWith({
        where: { expenseId: 1 },
        select: { id: true },
        orderBy: { id: 'asc' },
      });
      expect(prisma.expenseShare.update).toHaveBeenCalledTimes(3);
    });

    it('amount-only edit preserves the existing distribution by scaling shares proportionally', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expense.findUnique.mockResolvedValue(mockExpense);
      prisma.expense.findUniqueOrThrow.mockResolvedValueOnce({
        amount: { toNumber: () => 30 },
      });
      prisma.expense.update.mockResolvedValue(mockExpense);
      // Uneven shares (as a receipt-scan expense would have), summing to 30.
      prisma.expenseShare.findMany.mockResolvedValue([
        { id: 1, shareAmount: 5 },
        { id: 2, shareAmount: 25 },
      ]);
      prisma.expenseShare.update.mockResolvedValue({});
      prisma.expense.findUniqueOrThrow.mockResolvedValue(
        mockExpenseWithIncludes,
      );

      // memberIds untouched: this must scale 5/25 proportionally, not
      // flatten to an equal split.
      await service.updateExpense(1, 1, 1, { amount: 60 });

      expect(prisma.expenseShare.findMany).toHaveBeenCalledWith({
        where: { expenseId: 1 },
        select: { id: true, shareAmount: true },
        orderBy: { id: 'asc' },
      });
      const written = prisma.expenseShare.update.mock.calls.map(
        ([arg]: any[]) => Number(arg.data.shareAmount),
      );
      expect(written).toEqual([10, 50]); // 5 * (60/30), 25 * (60/30)
      expect(written.reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(
        60,
        10,
      );
    });

    it('amount-only recompute keeps sum(shares) === amount for odd splits', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expense.findUnique.mockResolvedValue(mockExpense);
      prisma.expense.findUniqueOrThrow.mockResolvedValueOnce({
        amount: { toNumber: () => 30 },
      });
      prisma.expense.update.mockResolvedValue(mockExpense);
      prisma.expenseShare.findMany.mockResolvedValue([
        { id: 1, shareAmount: 10 },
        { id: 2, shareAmount: 10 },
        { id: 3, shareAmount: 10 },
      ]);
      prisma.expenseShare.update.mockResolvedValue({});
      prisma.expense.findUniqueOrThrow.mockResolvedValue(
        mockExpenseWithIncludes,
      );

      // 100 scaled proportionally from an even 10/10/10 split: rounding
      // residual still reconciles onto the first share.
      await service.updateExpense(1, 1, 1, { amount: 100 });

      const written = prisma.expenseShare.update.mock.calls.map(
        ([arg]: any[]) => Number(arg.data.shareAmount),
      );
      expect(written.reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(
        100,
        10,
      );
    });

    it('should update expense members and recalculate shares', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expense.findUnique.mockResolvedValue(mockExpense);
      prisma.expense.findUniqueOrThrow
        .mockResolvedValueOnce({
          amount: { toNumber: () => 30 },
        })
        .mockResolvedValueOnce({
          ...mockExpenseWithIncludes,
          shares: [
            mockExpenseWithIncludes.shares[0],
            mockExpenseWithIncludes.shares[1],
          ],
        });
      prisma.expense.update.mockResolvedValue(mockExpense);
      prisma.tripMember.findMany.mockResolvedValue([
        { userId: 1 },
        { userId: 2 },
      ]);
      prisma.expenseShare.findMany
        .mockResolvedValueOnce([
          { id: 1, userId: 1 },
          { id: 2, userId: 2 },
          { id: 3, userId: 3 },
        ])
        .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
      prisma.expenseShare.deleteMany = jest
        .fn()
        .mockResolvedValue({ count: 1 });
      prisma.expenseShare.createMany.mockResolvedValue({ count: 0 });
      prisma.expenseShare.update.mockResolvedValue({});

      const result = await service.updateExpense(1, 1, 1, {
        memberIds: [1, 2],
      });

      expect(prisma.tripMember.findMany).toHaveBeenCalledWith({
        where: {
          tripId: 1,
          inviteStatus: InviteStatus.ACCEPTED,
          userId: { in: [1, 2] },
        },
        select: { userId: true },
        orderBy: { id: 'asc' },
      });
      expect(prisma.expenseShare.deleteMany).toHaveBeenCalledWith({
        where: { expenseId: 1, userId: { in: [3] } },
      });
      expect(prisma.expenseShare.update).toHaveBeenCalledTimes(2);
      expect(result.shares).toHaveLength(2);
    });

    it('should throw ForbiddenException when non-member tries to update', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(null);

      await expect(
        service.updateExpense(1, 1, 99, { name: 'Hacked' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('preserves stored exchangeRate and does not call rates when original fields are untouched', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expense.findUnique.mockResolvedValue(mockExpense);
      prisma.expense.findUniqueOrThrow
        .mockResolvedValueOnce({
          amount: new Prisma.Decimal(30),
        })
        .mockResolvedValueOnce({
          ...mockExpenseWithIncludes,
          originalAmount: new Prisma.Decimal(30),
          originalCurrency: Currency.VND,
          exchangeRate: new Prisma.Decimal(1),
        });
      prisma.expense.update.mockResolvedValue(mockExpense);

      const result = await service.updateExpense(1, 1, 1, {
        name: 'Renamed',
      });

      expect(exchangeRates.getRate).not.toHaveBeenCalled();

      for (const call of prisma.expense.update.mock.calls) {
        expect(call[0].data.originalAmount).toBeUndefined();
        expect(call[0].data.originalCurrency).toBeUndefined();
        expect(call[0].data.exchangeRate).toBeUndefined();
      }

      expect(result.rateStale).toBeUndefined();
      expect(result.exchangeRate).toBe(1);
    });

    it('calls rates and re-writes all 4 fields when originalCurrency changes', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expense.findUnique.mockResolvedValue(mockExpense);
      prisma.trip.findUniqueOrThrow.mockResolvedValue({
        currency: Currency.VND,
      });
      exchangeRates.getRate.mockResolvedValue({
        rate: new Prisma.Decimal('600'),
        fetchedAt: new Date(),
        isStale: false,
      });

      prisma.expense.findUniqueOrThrow
        .mockResolvedValueOnce({
          amount: new Prisma.Decimal(30),
        })
        .mockResolvedValueOnce({
          ...mockExpenseWithIncludes,
          originalAmount: new Prisma.Decimal('30'),
          originalCurrency: Currency.THB,
          exchangeRate: new Prisma.Decimal('600'),
        });
      prisma.expense.update.mockResolvedValue(mockExpense);
      prisma.expenseShare.findMany.mockResolvedValue([{ id: 1 }]);
      prisma.expenseShare.update.mockResolvedValue({});

      const result = await service.updateExpense(1, 1, 1, {
        originalAmount: 30,
        originalCurrency: Currency.THB,
      } as any);

      expect(exchangeRates.getRate).toHaveBeenCalledWith(
        Currency.THB,
        Currency.VND,
      );

      const updateArgs = prisma.expense.update.mock.calls[0][0];
      expect(updateArgs.data.originalCurrency).toBe(Currency.THB);
      expect(updateArgs.data.originalAmount.toString()).toBe('30');
      expect(updateArgs.data.exchangeRate.toString()).toBe('600');
      expect(updateArgs.data.amount.toString()).toBe('18000');

      expect(result.originalCurrency).toBe(Currency.THB);
      expect(result.exchangeRate).toBe(600);
    });

    it('resets originalAmount/originalCurrency/exchangeRate to home-currency defaults when only amount is sent', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expense.findUnique.mockResolvedValue(mockExpense);
      prisma.trip.findUniqueOrThrow.mockResolvedValue({
        currency: Currency.VND,
      });
      // Previously stored as foreign currency (THB @ 600)
      prisma.expense.findUniqueOrThrow
        .mockResolvedValueOnce({
          amount: new Prisma.Decimal(18000),
        })
        .mockResolvedValueOnce({
          ...mockExpenseWithIncludes,
          amount: new Prisma.Decimal(50),
          originalAmount: new Prisma.Decimal(50),
          originalCurrency: Currency.VND,
          exchangeRate: new Prisma.Decimal(1),
        });
      prisma.expense.update.mockResolvedValue(mockExpense);
      prisma.expenseShare.findMany.mockResolvedValue([{ id: 1 }]);
      prisma.expenseShare.update.mockResolvedValue({});

      const result = await service.updateExpense(1, 1, 1, { amount: 50 });

      // rates.getRate is rejected by default; reaching it would throw.
      expect(exchangeRates.getRate).not.toHaveBeenCalled();

      const updateArgs = prisma.expense.update.mock.calls[0][0];
      expect(Number(updateArgs.data.amount)).toBe(50);
      expect(Number(updateArgs.data.originalAmount)).toBe(50);
      expect(updateArgs.data.originalCurrency).toBe(Currency.VND);
      expect(Number(updateArgs.data.exchangeRate)).toBe(1);

      expect(result.rateStale).toBeUndefined();
      expect(result.originalCurrency).toBe(Currency.VND);
      expect(result.exchangeRate).toBe(1);
    });
  });

  describe('deleteExpense', () => {
    it('should delete expense when user is a member', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expense.findUnique.mockResolvedValue(mockExpense);
      prisma.expense.delete.mockResolvedValue(mockExpense);

      await service.deleteExpense(1, 1, 1);

      expect(prisma.expense.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should throw ForbiddenException when non-member tries to delete', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(null);

      await expect(service.deleteExpense(1, 1, 99)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw NotFoundException when expense does not exist', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expense.findUnique.mockResolvedValue(null);

      await expect(service.deleteExpense(1, 999, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('settleExpenseShare', () => {
    it('should settle a share when user is the share owner', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expenseShare.findUnique.mockResolvedValue({
        id: 1,
        expenseId: 1,
        userId: 1,
        shareAmount: { toNumber: () => 10 },
        isSettled: false,
        settledAt: null,
        expense: { tripId: 1 },
        user: { id: 1, displayName: 'Test User', avatarUrl: null },
      });
      const settledAt = new Date();
      prisma.expenseShare.update.mockResolvedValue({
        id: 1,
        expenseId: 1,
        userId: 1,
        shareAmount: { toNumber: () => 10 },
        isSettled: true,
        settledAt,
        user: { id: 1, displayName: 'Test User', avatarUrl: null },
      });

      const result = await service.settleExpenseShare(1, 1, 1, 1, {
        isSettled: true,
      });

      expect(result.isSettled).toBe(true);
      expect(result.settledAt).toBe(settledAt.toISOString());
    });

    it('should unsettle a share', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expenseShare.findUnique.mockResolvedValue({
        id: 1,
        expenseId: 1,
        userId: 1,
        shareAmount: { toNumber: () => 10 },
        isSettled: true,
        settledAt: new Date(),
        expense: { tripId: 1 },
        user: { id: 1, displayName: 'Test User', avatarUrl: null },
      });
      prisma.expenseShare.update.mockResolvedValue({
        id: 1,
        expenseId: 1,
        userId: 1,
        shareAmount: { toNumber: () => 10 },
        isSettled: false,
        settledAt: null,
        user: { id: 1, displayName: 'Test User', avatarUrl: null },
      });

      const result = await service.settleExpenseShare(1, 1, 1, 1, {
        isSettled: false,
      });

      expect(result.isSettled).toBe(false);
      expect(result.settledAt).toBeNull();
    });

    it('should throw ForbiddenException when user is not the share owner', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expenseShare.findUnique.mockResolvedValue({
        id: 1,
        expenseId: 1,
        userId: 2,
        shareAmount: { toNumber: () => 10 },
        isSettled: false,
        settledAt: null,
        expense: { tripId: 1 },
        user: { id: 2, displayName: 'User Two', avatarUrl: null },
      });

      await expect(
        service.settleExpenseShare(1, 1, 1, 1, { isSettled: true }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when share does not exist', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expenseShare.findUnique.mockResolvedValue(null);

      await expect(
        service.settleExpenseShare(1, 1, 999, 1, { isSettled: true }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when share belongs to different expense', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expenseShare.findUnique.mockResolvedValue({
        id: 1,
        expenseId: 99,
        userId: 1,
        shareAmount: { toNumber: () => 10 },
        isSettled: false,
        settledAt: null,
        expense: { tripId: 1 },
        user: { id: 1, displayName: 'Test User', avatarUrl: null },
      });

      await expect(
        service.settleExpenseShare(1, 1, 1, 1, { isSettled: true }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when expense belongs to different trip', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expenseShare.findUnique.mockResolvedValue({
        id: 1,
        expenseId: 1,
        userId: 1,
        shareAmount: { toNumber: () => 10 },
        isSettled: false,
        settledAt: null,
        expense: { tripId: 999 },
        user: { id: 1, displayName: 'Test User', avatarUrl: null },
      });

      await expect(
        service.settleExpenseShare(1, 1, 1, 1, { isSettled: true }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('splitAmount', () => {
    it('should split evenly when divisible', () => {
      const result = service.splitAmount(30, 3);
      expect(result).toEqual([10, 10, 10]);
      expect(result.reduce((a, b) => a + b, 0)).toBe(30);
    });

    it('should handle remainder by adding to first share', () => {
      const result = service.splitAmount(10, 3);
      expect(result).toEqual([3.34, 3.33, 3.33]);
      expect(Math.round(result.reduce((a, b) => a + b, 0) * 100) / 100).toBe(
        10,
      );
    });

    it('should return single share for count of 1', () => {
      const result = service.splitAmount(25.5, 1);
      expect(result).toEqual([25.5]);
    });

    it('should return empty array for count of 0', () => {
      const result = service.splitAmount(10, 0);
      expect(result).toEqual([]);
    });

    it('should handle two-way split with remainder', () => {
      const result = service.splitAmount(10.01, 2);
      expect(result).toEqual([5.01, 5]);
      expect(Math.round(result.reduce((a, b) => a + b, 0) * 100) / 100).toBe(
        10.01,
      );
    });
  });

  describe('assertMember', () => {
    it('should throw ForbiddenException when user is not a member', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(null);

      await expect(
        service.createExpense(1, 99, {
          name: 'Test',
          amount: 10,
          memberIds: [1],
          expenseDate: '2026-03-18',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when invite is pending', async () => {
      prisma.tripMember.findUnique.mockResolvedValue({
        ...mockMember,
        inviteStatus: InviteStatus.PENDING,
      });

      await expect(
        service.createExpense(1, 1, {
          name: 'Test',
          amount: 10,
          memberIds: [1],
          expenseDate: '2026-03-18',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assertExpenseBelongsToTrip', () => {
    it('should throw NotFoundException when expense belongs to different trip', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expense.findUnique.mockResolvedValue({
        ...mockExpense,
        tripId: 999,
      });

      await expect(service.getExpense(1, 1, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when expense does not exist', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockMember);
      prisma.expense.findUnique.mockResolvedValue(null);

      await expect(service.getExpense(1, 999, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

describe('Expense DTO cross-field validation', () => {
  describe('CreateExpenseDto', () => {
    it('accepts amount alone (no original fields)', async () => {
      const dto = plainToInstance(CreateExpenseDto, {
        name: 'Dinner',
        amount: 30,
        memberIds: [1],
        expenseDate: '2026-03-18',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts all currency fields together', async () => {
      const dto = plainToInstance(CreateExpenseDto, {
        name: 'Dinner',
        amount: 30,
        memberIds: [1],
        expenseDate: '2026-03-18',
        originalAmount: 30,
        originalCurrency: Currency.THB,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects originalAmount without originalCurrency', async () => {
      const dto = plainToInstance(CreateExpenseDto, {
        name: 'Dinner',
        amount: 30,
        memberIds: [1],
        expenseDate: '2026-03-18',
        originalAmount: 30,
      });
      const errors = await validate(dto);
      const property = errors.find((e) => e.property === 'originalCurrency');
      expect(property).toBeDefined();
      expect(property!.constraints).toEqual(
        expect.objectContaining({ isDefined: expect.any(String) }),
      );
    });

    it('rejects originalCurrency without originalAmount', async () => {
      const dto = plainToInstance(CreateExpenseDto, {
        name: 'Dinner',
        amount: 30,
        memberIds: [1],
        expenseDate: '2026-03-18',
        originalCurrency: Currency.THB,
      });
      const errors = await validate(dto);
      const property = errors.find((e) => e.property === 'originalAmount');
      expect(property).toBeDefined();
      expect(property!.constraints).toEqual(
        expect.objectContaining({ isDefined: expect.any(String) }),
      );
    });
  });

  describe('CreateReceiptExpenseDto', () => {
    const base = {
      name: 'Receipt',
      expenseDate: '2026-03-18',
      items: [{ name: 'Pho', amount: 50000, userId: 1 }],
    };

    it('accepts no originalCurrency', async () => {
      const dto = plainToInstance(CreateReceiptExpenseDto, base);
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts a valid Currency', async () => {
      const dto = plainToInstance(CreateReceiptExpenseDto, {
        ...base,
        originalCurrency: Currency.JPY,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects an invalid originalCurrency value', async () => {
      const dto = plainToInstance(CreateReceiptExpenseDto, {
        ...base,
        originalCurrency: 'XXX',
      });
      const errors = await validate(dto);
      const property = errors.find((e) => e.property === 'originalCurrency');
      expect(property).toBeDefined();
      expect(property!.constraints).toEqual(
        expect.objectContaining({ isEnum: expect.any(String) }),
      );
    });
  });

  describe('UpdateExpenseDto', () => {
    it('accepts empty object', async () => {
      const dto = plainToInstance(UpdateExpenseDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts all currency fields together', async () => {
      const dto = plainToInstance(UpdateExpenseDto, {
        amount: 30,
        originalAmount: 30,
        originalCurrency: Currency.THB,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects originalAmount without originalCurrency', async () => {
      const dto = plainToInstance(UpdateExpenseDto, {
        originalAmount: 30,
      });
      const errors = await validate(dto);
      const property = errors.find((e) => e.property === 'originalCurrency');
      expect(property).toBeDefined();
      expect(property!.constraints).toEqual(
        expect.objectContaining({ isDefined: expect.any(String) }),
      );
    });

    it('rejects originalCurrency without originalAmount', async () => {
      const dto = plainToInstance(UpdateExpenseDto, {
        originalCurrency: Currency.THB,
      });
      const errors = await validate(dto);
      const property = errors.find((e) => e.property === 'originalAmount');
      expect(property).toBeDefined();
      expect(property!.constraints).toEqual(
        expect.objectContaining({ isDefined: expect.any(String) }),
      );
    });
  });
});
