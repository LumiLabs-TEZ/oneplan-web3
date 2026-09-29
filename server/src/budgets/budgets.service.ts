import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityAction,
  Currency,
  ExpenseCategory,
  InviteStatus,
  PlanScope,
  Prisma,
} from '@prisma/client';
import { resolveAmounts } from '../common/currency/resolve-amounts';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { TripActivityService } from '../trip-activity/trip-activity.service';
import { BudgetDto } from './dto/budget.dto';
import { BudgetPaymentDto } from './dto/budget-payment.dto';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { MarkPaymentDto } from './dto/mark-payment.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';

const BUDGET_DETAIL_INCLUDE = {
  payments: {
    include: {
      user: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
    },
  },
} as const;

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: TripActivityService,
    private readonly storageService: StorageService,
    private readonly exchangeRatesService: ExchangeRatesService,
  ) {}

  async createBudget(
    tripId: number,
    userId: number,
    dto: CreateBudgetDto,
  ): Promise<BudgetDto> {
    await this.assertMember(tripId, userId);

    const scope = dto.scope ?? PlanScope.GROUP;

    // Mirrors the same guard in updateBudget: a PERSONAL budget has exactly one
    // payment row (the creator's), so a contributor list is meaningless there.
    if (dto.userIds !== undefined && scope !== PlanScope.GROUP) {
      throw new BadRequestException(
        'Contributors can only be updated for GROUP budgets',
      );
    }

    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: { currency: true },
    });

    const resolved = await resolveAmounts(
      this.exchangeRatesService,
      trip.currency,
      dto,
    );

    const homeAmount = resolved.amount;

    const budget = await this.prisma.$transaction(async (tx) => {
      if (scope === PlanScope.GROUP) {
        // An explicit contributor list narrows the fan-out; omitting it keeps
        // the original behaviour of charging every accepted member.
        let contributorIds: number[];
        if (dto.userIds !== undefined) {
          await this.validateMemberIds(tripId, dto.userIds, tx);
          contributorIds = Array.from(new Set(dto.userIds));
        } else {
          const members = await tx.tripMember.findMany({
            where: { tripId, inviteStatus: InviteStatus.ACCEPTED },
          });
          contributorIds = members.map((member) => member.userId);
        }

        const created = await tx.budget.create({
          data: {
            tripId,
            name: dto.name,
            amount: homeAmount,
            // NOT a division: each contributor is charged the full amount.
            perPersonAmount: homeAmount,
            scope,
            category: dto.category ?? null,
            originalAmount: resolved.originalAmount,
            originalCurrency: resolved.originalCurrency,
            exchangeRate: resolved.exchangeRate,
          },
        });

        await tx.budgetPayment.createMany({
          data: contributorIds.map((contributorId) => ({
            budgetId: created.id,
            userId: contributorId,
            amount: homeAmount,
          })),
        });

        return created;
      } else {
        const created = await tx.budget.create({
          data: {
            tripId,
            name: dto.name,
            amount: homeAmount,
            perPersonAmount: null,
            scope,
            category: dto.category ?? null,
            originalAmount: resolved.originalAmount,
            originalCurrency: resolved.originalCurrency,
            exchangeRate: resolved.exchangeRate,
          },
        });

        await tx.budgetPayment.create({
          data: {
            budgetId: created.id,
            userId,
            amount: homeAmount,
          },
        });

        return created;
      }
    });

    this.activityService.log(
      tripId,
      userId,
      ActivityAction.BUDGET_CREATED,
      budget.id,
      {
        name: dto.name,
        amount: Number(homeAmount),
      },
    );

    const detail = await this.findBudgetDetail(budget.id);
    if (resolved.isStale) {
      detail.rateStale = true;
    }
    return detail;
  }

  async listBudgets(tripId: number, userId: number): Promise<BudgetDto[]> {
    await this.assertMember(tripId, userId);

    const budgets = await this.prisma.budget.findMany({
      where: { tripId },
      include: BUDGET_DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(budgets.map((budget) => this.formatBudget(budget)));
  }

  async updateBudget(
    tripId: number,
    budgetId: number,
    userId: number,
    dto: UpdateBudgetDto,
  ): Promise<BudgetDto> {
    await this.assertMember(tripId, userId);
    await this.assertBudgetBelongsToTrip(budgetId, tripId);

    // Decide up-front whether we need to re-resolve the amount fields.
    //
    // Two cases trigger re-resolution:
    //   1. Client sent `originalAmount` + `originalCurrency` (foreign-currency edit):
    //      call rates and recompute the home-currency amount.
    //   2. Client sent only `amount` (home-currency edit): reset the original
    //      fields to match so the invariant `amount ≈ originalAmount × exchangeRate`
    //      stays true. `resolveAmounts` returns rate=1, originalCurrency=tripCurrency.
    //
    // If the client sent neither (e.g. just renaming), we skip this entirely
    // and preserve all stored currency fields.
    const originalChanged =
      dto.originalAmount !== undefined || dto.originalCurrency !== undefined;
    const amountChanged = dto.amount !== undefined;
    const needsResolve = originalChanged || amountChanged;

    let resolved: Awaited<ReturnType<typeof resolveAmounts>> | null = null;
    let freshConversionRan = false;

    if (needsResolve) {
      const trip = await this.prisma.trip.findUniqueOrThrow({
        where: { id: tripId },
        select: { currency: true },
      });
      resolved = await resolveAmounts(
        this.exchangeRatesService,
        trip.currency,
        {
          amount: dto.amount,
          originalAmount: dto.originalAmount,
          originalCurrency: dto.originalCurrency,
        },
      );
      // Track whether we hit the live rate API (only true when original fields
      // were sent). Amount-only updates use rate=1 and never call the API.
      freshConversionRan = originalChanged;
    }

    await this.prisma.$transaction(async (tx) => {
      const budget = await tx.budget.findUniqueOrThrow({
        where: { id: budgetId },
        select: {
          scope: true,
          amount: true,
          payments: { select: { id: true, userId: true } },
        },
      });

      if (dto.userIds !== undefined && budget.scope !== PlanScope.GROUP) {
        throw new BadRequestException(
          'Contributors can only be updated for GROUP budgets',
        );
      }

      if (dto.userIds !== undefined) {
        await this.validateMemberIds(tripId, dto.userIds, tx);
      }

      // Build the update payload.
      const updateData: Prisma.BudgetUpdateInput = {};
      if (dto.name !== undefined) {
        updateData.name = dto.name;
      }
      if (dto.category !== undefined) {
        updateData.category = dto.category;
      }

      let nextAmount: Prisma.Decimal | number | null = null;
      if (resolved) {
        // Re-resolved: overwrite all 4 currency fields so the invariant
        // amount ≈ originalAmount × exchangeRate always holds.
        updateData.amount = resolved.amount;
        updateData.originalAmount = resolved.originalAmount;
        updateData.originalCurrency = resolved.originalCurrency;
        updateData.exchangeRate = resolved.exchangeRate;
        nextAmount = resolved.amount;
      }

      if (Object.keys(updateData).length > 0) {
        await tx.budget.update({
          where: { id: budgetId },
          data: updateData,
        });
      }

      if (budget.scope === PlanScope.GROUP && dto.userIds !== undefined) {
        const requestedUserIds = Array.from(new Set(dto.userIds));
        const existingUserIds = new Set(budget.payments.map((p) => p.userId));
        const userIdsToAdd = requestedUserIds.filter(
          (id) => !existingUserIds.has(id),
        );
        const userIdsToRemove = budget.payments
          .map((p) => p.userId)
          .filter((id) => !requestedUserIds.includes(id));

        if (userIdsToRemove.length > 0) {
          await tx.budgetPayment.deleteMany({
            where: { budgetId, userId: { in: userIdsToRemove } },
          });
        }

        if (userIdsToAdd.length > 0) {
          const paymentAmount =
            nextAmount !== null ? nextAmount : budget.amount;
          await tx.budgetPayment.createMany({
            data: userIdsToAdd.map((memberUserId) => ({
              budgetId,
              userId: memberUserId,
              amount: paymentAmount as Prisma.Decimal | number,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (nextAmount !== null) {
        if (budget.scope === PlanScope.GROUP) {
          await tx.budget.update({
            where: { id: budgetId },
            data: { perPersonAmount: nextAmount },
          });

          await tx.budgetPayment.updateMany({
            where: { budgetId },
            data: { amount: nextAmount },
          });
        } else {
          // PERSONAL: single payment gets the full amount
          const payment = budget.payments[0];
          if (payment) {
            await tx.budgetPayment.update({
              where: { id: payment.id },
              data: { amount: nextAmount },
            });
          }
        }
      }
    });

    const detail = await this.findBudgetDetail(budgetId);
    // Only flag rateStale when a live rate was actually fetched. Amount-only
    // updates use rate=1 and must not produce a stale flag.
    if (freshConversionRan && resolved?.isStale) {
      detail.rateStale = true;
    }

    this.activityService.log(
      tripId,
      userId,
      ActivityAction.BUDGET_UPDATED,
      budgetId,
      {
        name: detail.name,
      },
    );

    return detail;
  }

  async deleteBudget(
    tripId: number,
    budgetId: number,
    userId: number,
  ): Promise<void> {
    await this.assertMember(tripId, userId);
    const budget = await this.assertBudgetBelongsToTrip(budgetId, tripId);

    await this.prisma.budget.delete({ where: { id: budgetId } });

    this.activityService.log(
      tripId,
      userId,
      ActivityAction.BUDGET_DELETED,
      budgetId,
      {
        name: budget.name,
      },
    );
  }

  async markBudgetPayment(
    tripId: number,
    budgetId: number,
    paymentId: number,
    userId: number,
    dto: MarkPaymentDto,
  ): Promise<BudgetPaymentDto> {
    await this.assertMember(tripId, userId);

    const payment = await this.prisma.budgetPayment.findUnique({
      where: { id: paymentId },
      include: {
        budget: {
          select: {
            tripId: true,
            trip: { select: { createdById: true } },
          },
        },
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    if (payment.budgetId !== budgetId || payment.budget.tripId !== tripId) {
      throw new NotFoundException('Payment not found');
    }

    const isPaymentOwner = payment.userId === userId;
    const isTripCreator = payment.budget.trip.createdById === userId;

    if (!isPaymentOwner && !isTripCreator) {
      throw new ForbiddenException(
        'Only the payment owner or trip creator can mark payments',
      );
    }

    const updated = await this.prisma.budgetPayment.update({
      where: { id: paymentId },
      data: {
        isPaid: dto.isPaid,
        paidAt: dto.isPaid ? new Date() : null,
      },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    this.activityService.log(
      tripId,
      userId,
      ActivityAction.BUDGET_PAID,
      paymentId,
      {
        displayName: updated.user.displayName,
        isPaid: dto.isPaid,
      },
    );

    return await this.formatPayment(updated);
  }

  async addPaymentsForMember(tripId: number, userId: number): Promise<void> {
    const groupBudgets = await this.prisma.budget.findMany({
      where: { tripId, scope: PlanScope.GROUP },
    });

    if (groupBudgets.length === 0) return;

    await this.prisma.budgetPayment.createMany({
      data: groupBudgets.map((budget) => ({
        budgetId: budget.id,
        userId,
        amount: budget.amount,
      })),
      skipDuplicates: true,
    });
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async assertMember(tripId: number, userId: number): Promise<void> {
    const member = await this.prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });

    if (!member || member.inviteStatus !== InviteStatus.ACCEPTED) {
      throw new ForbiddenException('You are not a member of this trip');
    }
  }

  private async validateMemberIds(
    tripId: number,
    userIds: number[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const uniqueUserIds = Array.from(new Set(userIds));
    const client = tx ?? this.prisma;

    const members = await client.tripMember.findMany({
      where: {
        tripId,
        inviteStatus: InviteStatus.ACCEPTED,
        userId: { in: uniqueUserIds },
      },
      select: { userId: true },
    });

    const foundIds = new Set(members.map((member) => member.userId));
    const invalidIds = uniqueUserIds.filter((id) => !foundIds.has(id));

    if (invalidIds.length > 0) {
      throw new BadRequestException(
        `Invalid member IDs: ${invalidIds.join(', ')}`,
      );
    }
  }

  private async assertBudgetBelongsToTrip(
    budgetId: number,
    tripId: number,
  ): Promise<{ id: number; name: string }> {
    const budget = await this.prisma.budget.findUnique({
      where: { id: budgetId },
      select: { id: true, name: true, tripId: true },
    });

    if (!budget || budget.tripId !== tripId) {
      throw new NotFoundException('Budget not found');
    }

    return { id: budget.id, name: budget.name };
  }

  private async findBudgetDetail(budgetId: number): Promise<BudgetDto> {
    const budget = await this.prisma.budget.findUniqueOrThrow({
      where: { id: budgetId },
      include: BUDGET_DETAIL_INCLUDE,
    });

    return this.formatBudget(budget);
  }

  private async formatBudget(budget: {
    id: number;
    tripId: number;
    name: string;
    amount: any;
    perPersonAmount: any;
    scope: PlanScope;
    category?: ExpenseCategory | null;
    originalAmount?: any;
    originalCurrency?: Currency | null;
    exchangeRate?: any;
    createdAt: Date;
    payments: Array<{
      id: number;
      userId: number;
      amount: any;
      isPaid: boolean;
      paidAt: Date | null;
      user: { id: number; displayName: string; avatarUrl: string | null };
    }>;
  }): Promise<BudgetDto> {
    return {
      id: budget.id,
      tripId: budget.tripId,
      name: budget.name,
      amount: Number(budget.amount),
      perPersonAmount:
        budget.perPersonAmount !== null ? Number(budget.perPersonAmount) : null,
      scope: budget.scope,
      category: budget.category ?? undefined,
      createdAt: budget.createdAt.toISOString(),
      payments: await Promise.all(
        budget.payments.map((p) => this.formatPayment(p)),
      ),
      originalAmount:
        budget.originalAmount !== null && budget.originalAmount !== undefined
          ? Number(budget.originalAmount)
          : undefined,
      originalCurrency: budget.originalCurrency ?? undefined,
      exchangeRate:
        budget.exchangeRate !== null && budget.exchangeRate !== undefined
          ? Number(budget.exchangeRate)
          : undefined,
    };
  }

  private async formatPayment(payment: {
    id: number;
    userId: number;
    amount: any;
    isPaid: boolean;
    paidAt: Date | null;
    user: { id: number; displayName: string; avatarUrl: string | null };
  }): Promise<BudgetPaymentDto> {
    return {
      id: payment.id,
      userId: payment.user.id,
      displayName: payment.user.displayName,
      avatarUrl: await this.resolveAvatarUrl(payment.user.avatarUrl),
      amount: Number(payment.amount),
      isPaid: payment.isPaid,
      paidAt: payment.paidAt?.toISOString() ?? null,
    };
  }

  private async resolveAvatarUrl(value: string | null): Promise<string | null> {
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    try {
      const { url } = await this.storageService.getSignedThumbUrl(value);
      return url;
    } catch {
      return null;
    }
  }
}
