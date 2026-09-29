import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  Currency,
  ExpenseCategory,
  InviteStatus,
  PlanScope,
  Prisma,
} from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ExchangeRatesService } from '../../src/exchange-rates/exchange-rates.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { StorageService } from '../../src/storage/storage.service';
import { TripActivityService } from '../../src/trip-activity/trip-activity.service';
import { BudgetsService } from '../../src/budgets/budgets.service';
import { CreateBudgetDto } from '../../src/budgets/dto/create-budget.dto';
import { UpdateBudgetDto } from '../../src/budgets/dto/update-budget.dto';

describe('BudgetsService', () => {
  let service: BudgetsService;
  let prisma: Record<string, any>;
  let activityService: Record<string, any>;
  let storageService: Record<string, any>;
  let exchangeRates: Record<string, any>;

  const mockMembers = [
    { id: 1, tripId: 1, userId: 1, inviteStatus: InviteStatus.ACCEPTED },
    { id: 2, tripId: 1, userId: 2, inviteStatus: InviteStatus.ACCEPTED },
    { id: 3, tripId: 1, userId: 3, inviteStatus: InviteStatus.ACCEPTED },
  ];

  const mockBudget = {
    id: 1,
    tripId: 1,
    name: 'Hotel Budget',
    amount: { toNumber: () => 100.0 },
    perPersonAmount: { toNumber: () => 100.0 },
    scope: PlanScope.GROUP,
    createdAt: new Date('2026-03-18'),
  };

  const mockBudgetWithPayments = {
    ...mockBudget,
    payments: [
      {
        id: 1,
        budgetId: 1,
        userId: 1,
        amount: { toNumber: () => 100.0 },
        isPaid: false,
        paidAt: null,
        user: { id: 1, displayName: 'User One', avatarUrl: null },
      },
      {
        id: 2,
        budgetId: 1,
        userId: 2,
        amount: { toNumber: () => 100.0 },
        isPaid: false,
        paidAt: null,
        user: { id: 2, displayName: 'User Two', avatarUrl: null },
      },
      {
        id: 3,
        budgetId: 1,
        userId: 3,
        amount: { toNumber: () => 100.0 },
        isPaid: false,
        paidAt: null,
        user: { id: 3, displayName: 'User Three', avatarUrl: null },
      },
    ],
  };

  const mockAcceptedMember = {
    id: 1,
    tripId: 1,
    userId: 1,
    inviteStatus: InviteStatus.ACCEPTED,
    joinedAt: new Date(),
  };

  beforeEach(() => {
    prisma = {
      tripMember: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      trip: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ currency: Currency.VND }),
      },
      budget: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      budgetPayment: {
        create: jest.fn(),
        createMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: any) => Promise<any>) => cb(prisma)),
    };

    activityService = { log: jest.fn() };
    storageService = {
      getSignedThumbUrl: jest
        .fn()
        .mockResolvedValue({ url: 'https://signed.example/avatar.jpg' }),
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

    service = new BudgetsService(
      prisma as unknown as PrismaService,
      activityService as unknown as TripActivityService,
      storageService as unknown as StorageService,
      exchangeRates as unknown as ExchangeRatesService,
    );
  });

  describe('createBudget', () => {
    it('should create a GROUP budget with per-person payments for all accepted members', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripMember.findMany.mockResolvedValue(mockMembers);
      prisma.budget.create.mockResolvedValue(mockBudget);
      prisma.budgetPayment.createMany.mockResolvedValue({ count: 3 });
      prisma.budget.findUniqueOrThrow.mockResolvedValue(mockBudgetWithPayments);

      const result = await service.createBudget(1, 1, {
        name: 'Hotel Budget',
        amount: 100.0,
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.tripMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tripId: 1, inviteStatus: InviteStatus.ACCEPTED },
        }),
      );
      const createArgs = prisma.budget.create.mock.calls[0][0];
      expect(createArgs.data.tripId).toBe(1);
      expect(createArgs.data.name).toBe('Hotel Budget');
      expect(createArgs.data.scope).toBe(PlanScope.GROUP);
      expect(Number(createArgs.data.amount)).toBe(100);
      expect(Number(createArgs.data.perPersonAmount)).toBe(100);
      // Each member gets the full per-person amount
      const createManyArgs = prisma.budgetPayment.createMany.mock.calls[0][0];
      const amounts = createManyArgs.data.map((d: any) => Number(d.amount));
      expect(amounts).toEqual([100, 100, 100]);
      const userIds = createManyArgs.data.map((d: any) => d.userId);
      expect(userIds).toEqual(expect.arrayContaining([1, 2, 3]));
      expect(result.id).toBe(1);
      expect(result.payments).toHaveLength(3);
    });

    it('should create a PERSONAL budget with a single payment for creator', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      const personalBudget = {
        ...mockBudget,
        scope: PlanScope.PERSONAL,
        perPersonAmount: null,
      };
      const personalBudgetWithPayments = {
        ...personalBudget,
        payments: [
          {
            id: 1,
            budgetId: 1,
            userId: 1,
            amount: { toNumber: () => 100.0 },
            isPaid: false,
            paidAt: null,
            user: { id: 1, displayName: 'User One', avatarUrl: null },
          },
        ],
      };

      prisma.budget.create.mockResolvedValue(personalBudget);
      prisma.budgetPayment.create.mockResolvedValue({});
      prisma.budget.findUniqueOrThrow.mockResolvedValue(
        personalBudgetWithPayments,
      );

      const result = await service.createBudget(1, 1, {
        name: 'My Budget',
        amount: 100.0,
        scope: PlanScope.PERSONAL,
      });

      const personalCreateArgs = prisma.budgetPayment.create.mock.calls[0][0];
      expect(personalCreateArgs.data.budgetId).toBe(1);
      expect(personalCreateArgs.data.userId).toBe(1);
      expect(Number(personalCreateArgs.data.amount)).toBe(100);
      expect(result.payments).toHaveLength(1);
      expect(result.perPersonAmount).toBeNull();
    });

    it('should throw ForbiddenException when user is not a member', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(null);

      await expect(
        service.createBudget(1, 99, { name: 'Budget', amount: 100.0 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('persists the category when supplied and null when omitted', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripMember.findMany.mockResolvedValue(mockMembers);
      prisma.budget.create.mockResolvedValue(mockBudget);
      prisma.budgetPayment.createMany.mockResolvedValue({ count: 3 });
      prisma.budget.findUniqueOrThrow.mockResolvedValue(mockBudgetWithPayments);

      await service.createBudget(1, 1, {
        name: 'Coffee run',
        amount: 100.0,
        category: ExpenseCategory.COFFEE,
      });
      expect(prisma.budget.create.mock.calls[0][0].data.category).toBe(
        ExpenseCategory.COFFEE,
      );

      prisma.budget.create.mockClear();
      await service.createBudget(1, 1, { name: 'Plain', amount: 100.0 });
      expect(prisma.budget.create.mock.calls[0][0].data.category).toBeNull();
    });

    it('fans out only to the supplied contributors, each at the FULL amount', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      // validateMemberIds resolves the subset against trip members.
      prisma.tripMember.findMany.mockResolvedValue([
        { userId: 1, inviteStatus: InviteStatus.ACCEPTED },
        { userId: 3, inviteStatus: InviteStatus.ACCEPTED },
      ]);
      prisma.budget.create.mockResolvedValue(mockBudget);
      prisma.budgetPayment.createMany.mockResolvedValue({ count: 2 });
      prisma.budget.findUniqueOrThrow.mockResolvedValue(mockBudgetWithPayments);

      await service.createBudget(1, 1, {
        name: 'Narrowed',
        amount: 100.0,
        userIds: [1, 3],
      });

      const createManyArgs = prisma.budgetPayment.createMany.mock.calls[0][0];
      expect(createManyArgs.data.map((d: any) => d.userId)).toEqual([1, 3]);
      // Guards the no-division invariant: perPersonAmount and every payment row
      // carry the full amount, not amount / contributors.
      expect(createManyArgs.data.map((d: any) => Number(d.amount))).toEqual([
        100, 100,
      ]);
      expect(
        Number(prisma.budget.create.mock.calls[0][0].data.perPersonAmount),
      ).toBe(100);
    });

    it('rejects contributor ids that are not trip members', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripMember.findMany.mockResolvedValue([
        { userId: 1, inviteStatus: InviteStatus.ACCEPTED },
      ]);
      prisma.budget.create.mockResolvedValue(mockBudget);

      await expect(
        service.createBudget(1, 1, {
          name: 'Bad',
          amount: 100.0,
          userIds: [1, 999],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects contributors on a PERSONAL budget', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);

      await expect(
        service.createBudget(1, 1, {
          name: 'Personal',
          amount: 100.0,
          scope: PlanScope.PERSONAL,
          userIds: [1],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('persists originalCurrency = trip.currency and exchangeRate = 1 when only amount is given', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripMember.findMany.mockResolvedValue(mockMembers);
      prisma.trip.findUniqueOrThrow.mockResolvedValue({
        currency: Currency.VND,
      });
      prisma.budget.create.mockResolvedValue(mockBudget);
      prisma.budgetPayment.createMany.mockResolvedValue({ count: 3 });
      prisma.budget.findUniqueOrThrow.mockResolvedValue({
        ...mockBudgetWithPayments,
        originalAmount: new Prisma.Decimal(100),
        originalCurrency: Currency.VND,
        exchangeRate: new Prisma.Decimal(1),
      });

      const result = await service.createBudget(1, 1, {
        name: 'Hotel Budget',
        amount: 100.0,
      });

      expect(exchangeRates.getRate).not.toHaveBeenCalled();

      const createArgs = prisma.budget.create.mock.calls[0][0];
      expect(createArgs.data.originalCurrency).toBe(Currency.VND);
      expect(createArgs.data.exchangeRate.toString()).toBe('1');
      expect(createArgs.data.originalAmount.toString()).toBe('100');
      expect(createArgs.data.amount.toString()).toBe('100');

      expect(result.originalCurrency).toBe(Currency.VND);
      expect(result.exchangeRate).toBe(1);
      expect(result.rateStale).toBeUndefined();
    });

    it('converts via rates.getRate when originalAmount + originalCurrency differ from trip currency', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripMember.findMany.mockResolvedValue([{ userId: 1 }]);
      prisma.trip.findUniqueOrThrow.mockResolvedValue({
        currency: Currency.VND,
      });
      exchangeRates.getRate.mockResolvedValue({
        rate: new Prisma.Decimal('600.5'),
        fetchedAt: new Date(),
        isStale: false,
      });
      prisma.budget.create.mockResolvedValue({ ...mockBudget, id: 77 });
      prisma.budget.findUniqueOrThrow.mockResolvedValue({
        ...mockBudgetWithPayments,
        id: 77,
        originalAmount: new Prisma.Decimal(100),
        originalCurrency: Currency.THB,
        exchangeRate: new Prisma.Decimal('600.5'),
      });

      const result = await service.createBudget(1, 1, {
        name: 'Street Food',
        amount: 100,
        originalAmount: 100,
        originalCurrency: Currency.THB,
      } as any);

      expect(exchangeRates.getRate).toHaveBeenCalledWith(
        Currency.THB,
        Currency.VND,
      );

      const createArgs = prisma.budget.create.mock.calls[0][0];
      expect(createArgs.data.amount.toString()).toBe('60050');
      expect(createArgs.data.originalAmount.toString()).toBe('100');
      expect(createArgs.data.originalCurrency).toBe(Currency.THB);
      expect(createArgs.data.exchangeRate.toString()).toBe('600.5');

      expect(result.originalCurrency).toBe(Currency.THB);
      expect(result.exchangeRate).toBe(600.5);
    });

    it('stores a 2dp-rounded converted amount mirrored into perPersonAmount and every payment row', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripMember.findMany.mockResolvedValue([
        { userId: 1 },
        { userId: 2 },
      ]);
      prisma.trip.findUniqueOrThrow.mockResolvedValue({
        currency: Currency.USD,
      });
      // 30 THB × 0.3335 = 10.005 → rounds half-up to 10.01 at the column
      // precision; perPersonAmount and each payment must carry the same
      // rounded value, not the raw product.
      exchangeRates.getRate.mockResolvedValue({
        rate: new Prisma.Decimal('0.3335'),
        fetchedAt: new Date(),
        isStale: false,
      });
      prisma.budget.create.mockResolvedValue({ ...mockBudget, id: 88 });
      prisma.budget.findUniqueOrThrow.mockResolvedValue({
        ...mockBudgetWithPayments,
        id: 88,
      });

      await service.createBudget(1, 1, {
        name: 'Boundary budget',
        amount: 30,
        originalAmount: 30,
        originalCurrency: Currency.THB,
      } as any);

      const createArgs = prisma.budget.create.mock.calls[0][0];
      expect(createArgs.data.amount.toString()).toBe('10.01');
      expect(createArgs.data.perPersonAmount.toString()).toBe('10.01');
      const paymentRows = prisma.budgetPayment.createMany.mock.calls[0][0].data;
      expect(paymentRows).toHaveLength(2);
      for (const row of paymentRows) {
        expect(row.amount.toString()).toBe('10.01');
      }
    });
  });

  describe('listBudgets', () => {
    it('should return all budgets for the trip with payments', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.budget.findMany.mockResolvedValue([mockBudgetWithPayments]);

      const result = await service.listBudgets(1, 1);

      expect(prisma.budget.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tripId: 1 },
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].payments).toHaveLength(3);
    });

    it('should throw ForbiddenException when user is not a member', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(null);

      await expect(service.listBudgets(1, 99)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('updateBudget', () => {
    it('should update budget name without recalculating payments', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.budget.findUnique.mockResolvedValue({
        id: 1,
        tripId: 1,
        name: 'Hotel Budget',
      });
      prisma.budget.update.mockResolvedValue(mockBudget);
      prisma.budget.findUniqueOrThrow
        .mockResolvedValueOnce({
          id: 1,
          tripId: 1,
          scope: PlanScope.GROUP,
          amount: { toNumber: () => 100.0 },
          payments: [
            { id: 1, userId: 1 },
            { id: 2, userId: 2 },
            { id: 3, userId: 3 },
          ],
        })
        .mockResolvedValueOnce(mockBudgetWithPayments);

      const result = await service.updateBudget(1, 1, 1, {
        name: 'Updated Name',
      });

      expect(prisma.budget.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({ name: 'Updated Name' }),
        }),
      );
      expect(result.id).toBe(1);
    });

    it('should update all payments to new per-person amount when amount changes', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.budget.findUnique.mockResolvedValue({
        id: 1,
        tripId: 1,
        name: 'Hotel Budget',
      });
      prisma.budget.update.mockResolvedValue(mockBudget);

      prisma.budget.findUniqueOrThrow
        .mockResolvedValueOnce({
          id: 1,
          tripId: 1,
          scope: PlanScope.GROUP,
          amount: { toNumber: () => 100.0 },
          payments: [
            { id: 1, userId: 1 },
            { id: 2, userId: 2 },
            { id: 3, userId: 3 },
          ],
        })
        .mockResolvedValueOnce(mockBudgetWithPayments);

      prisma.budgetPayment.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.updateBudget(1, 1, 1, { amount: 150.0 });

      // perPersonAmount updated to new amount
      const perPersonCall = prisma.budget.update.mock.calls.find(
        (call: any) => call[0].data.perPersonAmount !== undefined,
      );
      expect(perPersonCall).toBeDefined();
      expect(Number(perPersonCall[0].data.perPersonAmount)).toBe(150);
      // All payments updated to the new per-person amount
      const updateManyCall = prisma.budgetPayment.updateMany.mock.calls[0][0];
      expect(updateManyCall.where).toEqual({ budgetId: 1 });
      expect(Number(updateManyCall.data.amount)).toBe(150);
      expect(result.id).toBe(1);
    });

    it('should sync contributors for GROUP budgets and delete removed payment rows immediately', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripMember.findMany.mockResolvedValue([
        { userId: 1 },
        { userId: 3 },
      ]);
      prisma.budget.findUnique.mockResolvedValue({
        id: 1,
        tripId: 1,
        name: 'Hotel Budget',
      });
      prisma.budget.findUniqueOrThrow
        .mockResolvedValueOnce({
          id: 1,
          tripId: 1,
          scope: PlanScope.GROUP,
          amount: { toNumber: () => 100.0 },
          payments: [
            { id: 1, userId: 1 },
            { id: 2, userId: 2 },
            { id: 3, userId: 3 },
          ],
        })
        .mockResolvedValueOnce({
          ...mockBudgetWithPayments,
          payments: [
            mockBudgetWithPayments.payments[0],
            mockBudgetWithPayments.payments[2],
          ],
        });

      prisma.budgetPayment.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.updateBudget(1, 1, 1, {
        userIds: [1, 3],
      });

      expect(prisma.budgetPayment.deleteMany).toHaveBeenCalledWith({
        where: { budgetId: 1, userId: { in: [2] } },
      });
      expect(prisma.budgetPayment.createMany).not.toHaveBeenCalled();
      expect(result.payments).toHaveLength(2);
    });

    it('should add new contributor rows with updated amount when userIds and amount change together', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripMember.findMany.mockResolvedValue([
        { userId: 1 },
        { userId: 2 },
        { userId: 3 },
        { userId: 4 },
      ]);
      prisma.budget.findUnique.mockResolvedValue({
        id: 1,
        tripId: 1,
        name: 'Hotel Budget',
      });
      prisma.budget.findUniqueOrThrow
        .mockResolvedValueOnce({
          id: 1,
          tripId: 1,
          scope: PlanScope.GROUP,
          amount: { toNumber: () => 100.0 },
          payments: [
            { id: 1, userId: 1 },
            { id: 2, userId: 2 },
            { id: 3, userId: 3 },
          ],
        })
        .mockResolvedValueOnce(mockBudgetWithPayments);

      prisma.budgetPayment.createMany.mockResolvedValue({ count: 1 });
      prisma.budgetPayment.updateMany.mockResolvedValue({ count: 4 });

      await service.updateBudget(1, 1, 1, {
        amount: 150,
        userIds: [1, 2, 3, 4],
      });

      const createManyArgs = prisma.budgetPayment.createMany.mock.calls[0][0];
      expect(createManyArgs.skipDuplicates).toBe(true);
      expect(createManyArgs.data).toHaveLength(1);
      expect(createManyArgs.data[0].budgetId).toBe(1);
      expect(createManyArgs.data[0].userId).toBe(4);
      expect(Number(createManyArgs.data[0].amount)).toBe(150);

      const updateManyArgs = prisma.budgetPayment.updateMany.mock.calls[0][0];
      expect(updateManyArgs.where).toEqual({ budgetId: 1 });
      expect(Number(updateManyArgs.data.amount)).toBe(150);
    });

    it('should throw BadRequestException when contributor list contains invalid members', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.tripMember.findMany.mockResolvedValue([{ userId: 1 }]);
      prisma.budget.findUnique.mockResolvedValue({
        id: 1,
        tripId: 1,
        name: 'Hotel Budget',
      });
      prisma.budget.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        tripId: 1,
        scope: PlanScope.GROUP,
        amount: { toNumber: () => 100.0 },
        payments: [{ id: 1, userId: 1 }],
      });

      await expect(
        service.updateBudget(1, 1, 1, { userIds: [1, 999] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when userIds are provided for PERSONAL budgets', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.budget.findUnique.mockResolvedValue({
        id: 1,
        tripId: 1,
        name: 'My Budget',
      });
      prisma.budget.findUniqueOrThrow.mockResolvedValue({
        id: 1,
        tripId: 1,
        scope: PlanScope.PERSONAL,
        amount: { toNumber: () => 100.0 },
        payments: [{ id: 1, userId: 1 }],
      });

      await expect(
        service.updateBudget(1, 1, 1, { userIds: [1] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when budget does not belong to trip', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.budget.findUnique.mockResolvedValue({
        id: 1,
        tripId: 999,
        name: 'Hotel Budget',
      });

      await expect(
        service.updateBudget(1, 1, 1, { name: 'Hacked' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not a member', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(null);

      await expect(
        service.updateBudget(1, 1, 99, { name: 'Hacked' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('preserves stored exchangeRate and does not call rates when original fields are untouched', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.budget.findUnique.mockResolvedValue({
        id: 1,
        tripId: 1,
        name: 'Hotel Budget',
      });
      prisma.budget.update.mockResolvedValue(mockBudget);
      prisma.budget.findUniqueOrThrow
        .mockResolvedValueOnce({
          id: 1,
          tripId: 1,
          scope: PlanScope.GROUP,
          amount: new Prisma.Decimal(100),
          payments: [
            { id: 1, userId: 1 },
            { id: 2, userId: 2 },
            { id: 3, userId: 3 },
          ],
        })
        .mockResolvedValueOnce({
          ...mockBudgetWithPayments,
          originalAmount: new Prisma.Decimal(100),
          originalCurrency: Currency.VND,
          exchangeRate: new Prisma.Decimal(1),
        });

      const result = await service.updateBudget(1, 1, 1, {
        name: 'Updated Name',
      });

      expect(exchangeRates.getRate).not.toHaveBeenCalled();

      // None of the currency fields should have been written
      for (const call of prisma.budget.update.mock.calls) {
        expect(call[0].data.originalAmount).toBeUndefined();
        expect(call[0].data.originalCurrency).toBeUndefined();
        expect(call[0].data.exchangeRate).toBeUndefined();
      }

      expect(result.rateStale).toBeUndefined();
      expect(result.exchangeRate).toBe(1);
    });

    it('calls rates and re-writes all 4 fields when originalCurrency changes', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.budget.findUnique.mockResolvedValue({
        id: 1,
        tripId: 1,
        name: 'Hotel Budget',
      });
      prisma.trip.findUniqueOrThrow.mockResolvedValue({
        currency: Currency.VND,
      });
      exchangeRates.getRate.mockResolvedValue({
        rate: new Prisma.Decimal('600'),
        fetchedAt: new Date(),
        isStale: false,
      });

      prisma.budget.findUniqueOrThrow
        .mockResolvedValueOnce({
          id: 1,
          tripId: 1,
          scope: PlanScope.PERSONAL,
          amount: new Prisma.Decimal(100),
          payments: [{ id: 1, userId: 1 }],
        })
        .mockResolvedValueOnce({
          ...mockBudgetWithPayments,
          scope: PlanScope.PERSONAL,
          perPersonAmount: null,
          originalAmount: new Prisma.Decimal(100),
          originalCurrency: Currency.THB,
          exchangeRate: new Prisma.Decimal(600),
        });

      const result = await service.updateBudget(1, 1, 1, {
        originalAmount: 100,
        originalCurrency: Currency.THB,
      } as any);

      expect(exchangeRates.getRate).toHaveBeenCalledWith(
        Currency.THB,
        Currency.VND,
      );

      const updateWithCurrency = prisma.budget.update.mock.calls.find(
        (call: any) => call[0].data.originalCurrency !== undefined,
      );
      expect(updateWithCurrency).toBeDefined();
      expect(updateWithCurrency[0].data.originalCurrency).toBe(Currency.THB);
      expect(updateWithCurrency[0].data.originalAmount.toString()).toBe('100');
      expect(updateWithCurrency[0].data.exchangeRate.toString()).toBe('600');
      expect(updateWithCurrency[0].data.amount.toString()).toBe('60000');

      expect(result.originalCurrency).toBe(Currency.THB);
      expect(result.exchangeRate).toBe(600);
    });

    it('resets originalAmount/originalCurrency/exchangeRate to home-currency defaults when only amount is sent', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.budget.findUnique.mockResolvedValue({
        id: 1,
        tripId: 1,
        name: 'Hotel Budget',
      });
      prisma.trip.findUniqueOrThrow.mockResolvedValue({
        currency: Currency.VND,
      });
      // Previously stored as foreign currency (THB @ 600)
      prisma.budget.findUniqueOrThrow
        .mockResolvedValueOnce({
          id: 1,
          tripId: 1,
          scope: PlanScope.PERSONAL,
          amount: new Prisma.Decimal(30000),
          payments: [{ id: 1, userId: 1 }],
        })
        .mockResolvedValueOnce({
          ...mockBudgetWithPayments,
          scope: PlanScope.PERSONAL,
          perPersonAmount: null,
          amount: new Prisma.Decimal(50),
          originalAmount: new Prisma.Decimal(50),
          originalCurrency: Currency.VND,
          exchangeRate: new Prisma.Decimal(1),
        });
      prisma.budgetPayment.update.mockResolvedValue({});

      const result = await service.updateBudget(1, 1, 1, { amount: 50 });

      // rates.getRate is rejected by default; reaching it would throw.
      expect(exchangeRates.getRate).not.toHaveBeenCalled();

      const updateCall = prisma.budget.update.mock.calls.find(
        (call: any) => call[0].data.amount !== undefined,
      );
      expect(updateCall).toBeDefined();
      expect(Number(updateCall[0].data.amount)).toBe(50);
      expect(Number(updateCall[0].data.originalAmount)).toBe(50);
      expect(updateCall[0].data.originalCurrency).toBe(Currency.VND);
      expect(Number(updateCall[0].data.exchangeRate)).toBe(1);

      expect(result.rateStale).toBeUndefined();
      expect(result.originalCurrency).toBe(Currency.VND);
      expect(result.exchangeRate).toBe(1);
    });
  });

  describe('deleteBudget', () => {
    it('should delete budget when user is a member and budget belongs to trip', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.budget.findUnique.mockResolvedValue({
        id: 1,
        tripId: 1,
        name: 'Hotel Budget',
      });
      prisma.budget.delete.mockResolvedValue(mockBudget);

      await service.deleteBudget(1, 1, 1);

      expect(prisma.budget.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should throw NotFoundException when budget does not belong to trip', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.budget.findUnique.mockResolvedValue({
        id: 1,
        tripId: 999,
        name: 'Hotel Budget',
      });

      await expect(service.deleteBudget(1, 1, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user is not a member', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(null);

      await expect(service.deleteBudget(1, 1, 99)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('markBudgetPayment', () => {
    const mockPaymentWithIncludes = {
      id: 1,
      budgetId: 1,
      userId: 1,
      amount: { toNumber: () => 100.0 },
      isPaid: false,
      paidAt: null,
      budget: { tripId: 1, trip: { createdById: 1 } },
      user: { id: 1, displayName: 'User One', avatarUrl: null },
    };

    it('should mark payment as paid when user is the payment owner', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.budgetPayment.findUnique.mockResolvedValue(
        mockPaymentWithIncludes,
      );
      prisma.budgetPayment.update.mockResolvedValue({
        ...mockPaymentWithIncludes,
        isPaid: true,
        paidAt: new Date(),
      });

      const result = await service.markBudgetPayment(1, 1, 1, 1, {
        isPaid: true,
      });

      expect(prisma.budgetPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            isPaid: true,
            paidAt: expect.any(Date),
          }),
        }),
      );
      expect(result.isPaid).toBe(true);
    });

    it('should mark payment as unpaid', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.budgetPayment.findUnique.mockResolvedValue({
        ...mockPaymentWithIncludes,
        isPaid: true,
        paidAt: new Date(),
      });
      prisma.budgetPayment.update.mockResolvedValue({
        ...mockPaymentWithIncludes,
        isPaid: false,
        paidAt: null,
      });

      const result = await service.markBudgetPayment(1, 1, 1, 1, {
        isPaid: false,
      });

      expect(prisma.budgetPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isPaid: false,
            paidAt: null,
          }),
        }),
      );
      expect(result.isPaid).toBe(false);
      expect(result.paidAt).toBeNull();
    });

    it('should mark payment as paid when user is the trip creator', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.budgetPayment.findUnique.mockResolvedValue({
        ...mockPaymentWithIncludes,
        userId: 2,
        budget: { tripId: 1, trip: { createdById: 1 } },
      });
      prisma.budgetPayment.update.mockResolvedValue({
        ...mockPaymentWithIncludes,
        userId: 2,
        isPaid: true,
        paidAt: new Date(),
      });

      const result = await service.markBudgetPayment(1, 1, 1, 1, {
        isPaid: true,
      });

      expect(prisma.budgetPayment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            isPaid: true,
            paidAt: expect.any(Date),
          }),
        }),
      );
      expect(result.isPaid).toBe(true);
    });

    it('should throw ForbiddenException when user is neither payment owner nor trip creator', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.budgetPayment.findUnique.mockResolvedValue({
        ...mockPaymentWithIncludes,
        userId: 2,
        budget: { tripId: 1, trip: { createdById: 3 } },
      });

      await expect(
        service.markBudgetPayment(1, 1, 1, 1, { isPaid: true }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when payment does not exist', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.budgetPayment.findUnique.mockResolvedValue(null);

      await expect(
        service.markBudgetPayment(1, 1, 999, 1, { isPaid: true }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when payment does not belong to budget', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.budgetPayment.findUnique.mockResolvedValue({
        ...mockPaymentWithIncludes,
        budgetId: 999,
      });

      await expect(
        service.markBudgetPayment(1, 1, 1, 1, { isPaid: true }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when budget does not belong to trip', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(mockAcceptedMember);
      prisma.budgetPayment.findUnique.mockResolvedValue({
        ...mockPaymentWithIncludes,
        budget: { tripId: 999 },
      });

      await expect(
        service.markBudgetPayment(1, 1, 1, 1, { isPaid: true }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not a trip member', async () => {
      prisma.tripMember.findUnique.mockResolvedValue(null);

      await expect(
        service.markBudgetPayment(1, 1, 1, 99, { isPaid: true }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('addPaymentsForMember', () => {
    it('should create payments for all GROUP budgets for the new member', async () => {
      const groupBudgets = [
        {
          id: 1,
          tripId: 1,
          name: 'Hotel',
          amount: 100.0,
          scope: PlanScope.GROUP,
        },
        {
          id: 2,
          tripId: 1,
          name: 'Food',
          amount: 50.0,
          scope: PlanScope.GROUP,
        },
      ];
      prisma.budget.findMany.mockResolvedValue(groupBudgets);
      prisma.budgetPayment.createMany.mockResolvedValue({ count: 2 });

      await service.addPaymentsForMember(1, 4);

      expect(prisma.budget.findMany).toHaveBeenCalledWith({
        where: { tripId: 1, scope: PlanScope.GROUP },
      });
      expect(prisma.budgetPayment.createMany).toHaveBeenCalledWith({
        data: [
          { budgetId: 1, userId: 4, amount: 100.0 },
          { budgetId: 2, userId: 4, amount: 50.0 },
        ],
        skipDuplicates: true,
      });
    });

    it('should do nothing when there are no GROUP budgets', async () => {
      prisma.budget.findMany.mockResolvedValue([]);

      await service.addPaymentsForMember(1, 4);

      expect(prisma.budgetPayment.createMany).not.toHaveBeenCalled();
    });
  });
});

describe('Budget DTO cross-field validation', () => {
  describe('CreateBudgetDto', () => {
    it('accepts amount alone', async () => {
      const dto = plainToInstance(CreateBudgetDto, {
        name: 'Hotels',
        amount: 100,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts all three currency fields together', async () => {
      const dto = plainToInstance(CreateBudgetDto, {
        name: 'Hotels',
        amount: 100,
        originalAmount: 100,
        originalCurrency: Currency.THB,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects originalAmount without originalCurrency', async () => {
      const dto = plainToInstance(CreateBudgetDto, {
        name: 'Hotels',
        amount: 100,
        originalAmount: 100,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const property = errors.find((e) => e.property === 'originalCurrency');
      expect(property).toBeDefined();
      expect(property!.constraints).toEqual(
        expect.objectContaining({ isDefined: expect.any(String) }),
      );
    });

    it('rejects originalCurrency without originalAmount', async () => {
      const dto = plainToInstance(CreateBudgetDto, {
        name: 'Hotels',
        amount: 100,
        originalCurrency: Currency.THB,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      const property = errors.find((e) => e.property === 'originalAmount');
      expect(property).toBeDefined();
      expect(property!.constraints).toEqual(
        expect.objectContaining({ isDefined: expect.any(String) }),
      );
    });
  });

  describe('UpdateBudgetDto', () => {
    it('accepts empty object', async () => {
      const dto = plainToInstance(UpdateBudgetDto, {});
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts all three currency fields together', async () => {
      const dto = plainToInstance(UpdateBudgetDto, {
        amount: 100,
        originalAmount: 100,
        originalCurrency: Currency.THB,
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('rejects originalAmount without originalCurrency', async () => {
      const dto = plainToInstance(UpdateBudgetDto, {
        originalAmount: 100,
      });
      const errors = await validate(dto);
      const property = errors.find((e) => e.property === 'originalCurrency');
      expect(property).toBeDefined();
      expect(property!.constraints).toEqual(
        expect.objectContaining({ isDefined: expect.any(String) }),
      );
    });

    it('rejects originalCurrency without originalAmount', async () => {
      const dto = plainToInstance(UpdateBudgetDto, {
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
