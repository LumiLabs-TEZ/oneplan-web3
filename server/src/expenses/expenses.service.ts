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
import { TripsHandler } from '../realtime/handlers/trips.handler';
import { StorageService } from '../storage/storage.service';
import { TripActivityService } from '../trip-activity/trip-activity.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { ANALYTICS_EVENTS } from '../analytics/constants/events';
import { MissionsService } from '../missions/missions.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateReceiptExpenseDto } from './dto/create-receipt-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpenseDto } from './dto/expense.dto';
import { ExpenseShareDto } from './dto/expense-share.dto';
import {
  SharedMemberPreviewDto,
  ExpenseSummaryDto,
} from './dto/expense-summary.dto';
import {
  TripBreakdownDto,
  MemberBreakdownDto,
  BreakdownExpenseItemDto,
} from './dto/expense-breakdown.dto';
import { ListExpensesQueryDto } from './dto/list-expenses-query.dto';
import { SettleShareDto } from './dto/settle-share.dto';
import {
  TripSettlementSummaryDto,
  CounterpartySettlementDto,
  SettleCounterpartyDto,
} from './dto/trip-settlement.dto';

const EXPENSE_DETAIL_INCLUDE = {
  paidBy: {
    select: { id: true, displayName: true, avatarUrl: true },
  },
  shares: {
    include: {
      user: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
    },
  },
} as const;

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: TripActivityService,
    private readonly storageService: StorageService,
    private readonly exchangeRatesService: ExchangeRatesService,
    private readonly tripsHandler: TripsHandler,
    private readonly analytics: AnalyticsService,
    private readonly missions: MissionsService,
  ) {}

  async createExpense(
    tripId: number,
    userId: number,
    dto: CreateExpenseDto,
  ): Promise<ExpenseDto> {
    await this.assertMember(tripId, userId);

    const members = await this.prisma.tripMember.findMany({
      where: {
        tripId,
        inviteStatus: InviteStatus.ACCEPTED,
        userId: { in: dto.memberIds },
      },
      // PRODUCT RULE (operator, 2026-08-19): the odd minor unit left over by
      // splitAmount goes to the FIRST MEMBER OF THE TRIP — the earliest
      // joiner. `trip_member.id` ascending IS join order, so this orderBy is
      // the rule, not just a tie-breaker: splitAmount puts the remainder on
      // shares[0], i.e. whoever is first here.
      //
      // Note this is member id, NOT user id. Without the orderBy, Postgres was
      // free to return any order; it happened to return user-id order, so the
      // cent landed on the lowest userId purely by accident — stable until a
      // query plan changed, with no commit to blame. Do not remove this.
      orderBy: { id: 'asc' },
    });
    const acceptedMemberIds = members.map((m) => m.userId);
    if (acceptedMemberIds.length === 0) {
      throw new BadRequestException(
        'No accepted trip members found in the provided list',
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

    const category = dto.category ?? ExpenseCategory.OTHER;
    const paidById = await this.resolvePayer(
      tripId,
      userId,
      dto.paidById,
      dto.paidByGroup,
    );
    const homeAmountNumber = Number(resolved.amount);
    const shares = this.splitAmount(homeAmountNumber, acceptedMemberIds.length);

    const expense = await this.prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          tripId,
          paidById,
          name: dto.name,
          amount: resolved.amount,
          category,
          note: dto.note,
          expenseDate: new Date(dto.expenseDate),
          originalAmount: resolved.originalAmount,
          originalCurrency: resolved.originalCurrency,
          exchangeRate: resolved.exchangeRate,
        },
      });

      await tx.expenseShare.createMany({
        data: acceptedMemberIds.map((memberId, index) => ({
          expenseId: created.id,
          userId: memberId,
          shareAmount: shares[index],
        })),
      });

      return created;
    });

    this.activityService.log(
      tripId,
      userId,
      ActivityAction.EXPENSE_CREATED,
      expense.id,
      {
        name: dto.name,
        amount: homeAmountNumber,
      },
    );

    void this.analytics.track(ANALYTICS_EVENTS.EXPENSE_ADDED, {
      userId,
      properties: {
        tripId,
        expenseId: expense.id,
        amount: homeAmountNumber,
        category: expense.category,
        source: 'manual',
      },
    });
    void this.missions.onExpenseAdded(userId);

    const detail = await this.findExpenseDetail(expense.id);
    if (resolved.isStale) {
      detail.rateStale = true;
    }
    return detail;
  }

  async createReceiptExpense(
    tripId: number,
    userId: number,
    dto: CreateReceiptExpenseDto,
  ): Promise<ExpenseDto> {
    await this.assertMember(tripId, userId);

    const uniqueUserIds = [...new Set(dto.items.map((item) => item.userId))];

    const members = await this.prisma.tripMember.findMany({
      where: {
        tripId,
        inviteStatus: InviteStatus.ACCEPTED,
        userId: { in: uniqueUserIds },
      },
    });
    const acceptedMemberIds = new Set(members.map((m) => m.userId));

    const invalidIds = uniqueUserIds.filter((id) => !acceptedMemberIds.has(id));
    if (invalidIds.length > 0) {
      throw new BadRequestException(
        `No accepted trip members found for user IDs: ${invalidIds.join(', ')}`,
      );
    }

    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: { currency: true },
    });

    const round2 = (n: number) => Math.round(n * 100) / 100;

    // Per-user subtotals + grand total, in the ORIGINAL (scanned) currency.
    const origShareMap = new Map<number, number>();
    let origTotal = 0;
    for (const item of dto.items) {
      const current = origShareMap.get(item.userId) ?? 0;
      origShareMap.set(item.userId, round2(current + item.amount));
      origTotal = round2(origTotal + item.amount);
    }

    // Convert to the trip (group) currency exactly the way manual expenses
    // do. Only a currency that differs from the trip currency triggers an
    // FX lookup; same-currency / unset degrades to rate = 1 with no getRate
    // call (mirrors createExpense's amount-only path).
    const isForeign =
      dto.originalCurrency != null && dto.originalCurrency !== trip.currency;
    const resolved = await resolveAmounts(
      this.exchangeRatesService,
      trip.currency,
      {
        amount: origTotal,
        originalAmount: isForeign ? origTotal : undefined,
        originalCurrency: isForeign ? dto.originalCurrency : undefined,
      },
    );

    const rate = Number(resolved.exchangeRate);
    const convertedTotal = round2(Number(resolved.amount));

    // Convert each per-user subtotal with the SAME rate, then reconcile the
    // rounding residual onto the largest share so shares sum EXACTLY to the
    // converted total (mirrors splitAmount's "residual on one share").
    const shareEntries = Array.from(origShareMap.entries()).map(
      ([memberId, origShare]) => ({
        memberId,
        shareAmount: round2(origShare * rate),
      }),
    );
    if (shareEntries.length > 0) {
      const sumShares = round2(
        shareEntries.reduce((acc, e) => acc + e.shareAmount, 0),
      );
      const residual = round2(convertedTotal - sumShares);
      if (residual !== 0) {
        let largestIdx = 0;
        for (let i = 1; i < shareEntries.length; i++) {
          if (
            shareEntries[i].shareAmount > shareEntries[largestIdx].shareAmount
          ) {
            largestIdx = i;
          }
        }
        shareEntries[largestIdx].shareAmount = round2(
          shareEntries[largestIdx].shareAmount + residual,
        );
      }
    }

    const category = dto.category ?? ExpenseCategory.FOOD;
    const paidById = await this.resolvePayer(tripId, userId, dto.paidById);

    const expense = await this.prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          tripId,
          paidById,
          name: dto.name,
          amount: resolved.amount,
          category,
          note: dto.note,
          expenseDate: new Date(dto.expenseDate),
          originalAmount: resolved.originalAmount,
          originalCurrency: resolved.originalCurrency,
          exchangeRate: resolved.exchangeRate,
        },
      });

      await tx.expenseShare.createMany({
        data: shareEntries.map(({ memberId, shareAmount }) => ({
          expenseId: created.id,
          userId: memberId,
          shareAmount,
        })),
      });

      return created;
    });

    this.activityService.log(
      tripId,
      userId,
      ActivityAction.EXPENSE_CREATED,
      expense.id,
      {
        name: dto.name,
        amount: convertedTotal,
      },
    );

    void this.analytics.track(ANALYTICS_EVENTS.EXPENSE_ADDED, {
      userId,
      properties: {
        tripId,
        expenseId: expense.id,
        amount: convertedTotal,
        category,
        source: 'receipt',
      },
    });
    void this.missions.onExpenseAdded(userId);

    const detail = await this.findExpenseDetail(expense.id);
    if (resolved.isStale) {
      detail.rateStale = true;
    }
    return detail;
  }

  async listExpenses(
    tripId: number,
    userId: number,
    query: ListExpensesQueryDto,
  ): Promise<ExpenseSummaryDto[]> {
    await this.assertMember(tripId, userId);

    const expenses = await this.prisma.expense.findMany({
      where: {
        tripId,
        ...(query.category ? { category: query.category } : {}),
      },
      include: {
        paidBy: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        shares: {
          include: {
            user: {
              select: { id: true, avatarUrl: true },
            },
          },
        },
      },
      orderBy: { expenseDate: 'desc' },
    });

    return Promise.all(
      expenses.map((expense) => this.formatExpenseSummary(expense)),
    );
  }

  async getExpense(
    tripId: number,
    expenseId: number,
    userId: number,
  ): Promise<ExpenseDto> {
    await this.assertMember(tripId, userId);
    await this.assertExpenseBelongsToTrip(expenseId, tripId);
    return this.findExpenseDetail(expenseId);
  }

  async updateExpense(
    tripId: number,
    expenseId: number,
    userId: number,
    dto: UpdateExpenseDto,
  ): Promise<ExpenseDto> {
    await this.assertMember(tripId, userId);
    await this.assertExpenseBelongsToTrip(expenseId, tripId);

    // See budgets.service.ts for the same logic and rationale. Either
    // original-currency fields OR an amount-only edit re-resolves all 4
    // currency fields to keep the invariant amount ≈ originalAmount × rate.
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
      freshConversionRan = originalChanged;
    }

    // Resolve a payer change (person, or the shared group wallet) up front.
    const payerChanged =
      dto.paidByGroup !== undefined || dto.paidById !== undefined;
    const nextPayerId = payerChanged
      ? await this.resolvePayer(tripId, userId, dto.paidById, dto.paidByGroup)
      : undefined;

    await this.prisma.$transaction(async (tx) => {
      const existingExpense = await tx.expense.findUniqueOrThrow({
        where: { id: expenseId },
        select: { amount: true },
      });

      // Determine the amount to use for share recomputation.
      const nextAmountNumber: number = resolved
        ? Number(resolved.amount)
        : Number(existingExpense.amount);

      const updateData: Prisma.ExpenseUpdateInput = {};
      if (dto.name !== undefined) updateData.name = dto.name;
      if (dto.category !== undefined) updateData.category = dto.category;
      if (dto.note !== undefined) updateData.note = dto.note;
      if (dto.expenseDate !== undefined) {
        updateData.expenseDate = new Date(dto.expenseDate);
      }
      if (payerChanged) {
        updateData.paidBy =
          nextPayerId === null
            ? { disconnect: true }
            : { connect: { id: nextPayerId } };
      }

      if (resolved) {
        updateData.amount = resolved.amount;
        updateData.originalAmount = resolved.originalAmount;
        updateData.originalCurrency = resolved.originalCurrency;
        updateData.exchangeRate = resolved.exchangeRate;
      }

      if (Object.keys(updateData).length > 0) {
        await tx.expense.update({
          where: { id: expenseId },
          data: updateData,
        });
      }

      if (dto.memberIds !== undefined) {
        const members = await tx.tripMember.findMany({
          where: {
            tripId,
            inviteStatus: InviteStatus.ACCEPTED,
            userId: { in: dto.memberIds },
          },
          select: { userId: true },
          // Same rule as createExpense: remainder goes to the first member of
          // the trip (earliest joiner). Pinned so it can never depend on
          // unspecified Postgres row order.
          orderBy: { id: 'asc' },
        });
        const acceptedMemberIds = Array.from(
          new Set(members.map((member) => member.userId)),
        );
        if (acceptedMemberIds.length === 0) {
          throw new BadRequestException(
            'No accepted trip members found in the provided list',
          );
        }

        const existingShares = await tx.expenseShare.findMany({
          where: { expenseId },
          select: { id: true, userId: true },
        });
        const existingShareUserIds = new Set(
          existingShares.map((share) => share.userId),
        );
        const shareUserIdsToRemove = existingShares
          .map((share) => share.userId)
          .filter((shareUserId) => !acceptedMemberIds.includes(shareUserId));
        const shareUserIdsToAdd = acceptedMemberIds.filter(
          (memberId) => !existingShareUserIds.has(memberId),
        );

        if (shareUserIdsToRemove.length > 0) {
          await tx.expenseShare.deleteMany({
            where: { expenseId, userId: { in: shareUserIdsToRemove } },
          });
        }

        if (shareUserIdsToAdd.length > 0) {
          await tx.expenseShare.createMany({
            data: shareUserIdsToAdd.map((memberId) => ({
              expenseId,
              userId: memberId,
              shareAmount: 0,
            })),
          });
        }

        // Membership was SENT: re-split equally across the participant set.
        // NB the condition is "memberIds was provided", not "membership
        // actually changed" — re-sending an identical member list still
        // flattens an uneven split. No shipping client does that (both Android
        // and iOS omit memberIds when unchanged: TripCurrencyRules.changedMemberIds
        // / EditExpenseView.swift), so this is latent, not live.
        const currentShares = await tx.expenseShare.findMany({
          where: { expenseId },
          select: { id: true },
          orderBy: { id: 'asc' },
        });
        const shares = this.splitAmount(nextAmountNumber, currentShares.length);

        for (let i = 0; i < currentShares.length; i++) {
          await tx.expenseShare.update({
            where: { id: currentShares[i].id },
            data: { shareAmount: shares[i] },
          });
        }
      } else if (resolved) {
        // Amount (or currency) changed but membership didn't: preserve the
        // existing distribution by scaling every share proportionally to
        // the new total, instead of flattening it to an equal split. This
        // matters for receipt-scan expenses, whose per-item shares are
        // deliberately uneven — an equal re-split here would silently and
        // irreversibly discard that distribution.
        const currentShares = await tx.expenseShare.findMany({
          where: { expenseId },
          select: { id: true, shareAmount: true },
          orderBy: { id: 'asc' },
        });
        const shares = this.scaleShares(currentShares, nextAmountNumber);

        for (let i = 0; i < currentShares.length; i++) {
          await tx.expenseShare.update({
            where: { id: currentShares[i].id },
            data: { shareAmount: shares[i] },
          });
        }
      }
    });

    const detail = await this.findExpenseDetail(expenseId);
    // Only flag rateStale when a live rate was actually fetched. Amount-only
    // updates use rate=1 and must not produce a stale flag.
    if (freshConversionRan && resolved?.isStale) {
      detail.rateStale = true;
    }

    this.activityService.log(
      tripId,
      userId,
      ActivityAction.EXPENSE_UPDATED,
      expenseId,
      {
        name: detail.name,
      },
    );

    return detail;
  }

  async deleteExpense(
    tripId: number,
    expenseId: number,
    userId: number,
  ): Promise<void> {
    await this.assertMember(tripId, userId);
    const expense = await this.assertExpenseBelongsToTrip(expenseId, tripId);

    await this.prisma.expense.delete({ where: { id: expenseId } });

    this.activityService.log(
      tripId,
      userId,
      ActivityAction.EXPENSE_DELETED,
      expenseId,
      {
        name: expense.name,
      },
    );
  }

  async settleExpenseShare(
    tripId: number,
    expenseId: number,
    shareId: number,
    userId: number,
    dto: SettleShareDto,
  ): Promise<ExpenseShareDto> {
    await this.assertMember(tripId, userId);

    const share = await this.prisma.expenseShare.findUnique({
      where: { id: shareId },
      include: {
        expense: { select: { tripId: true } },
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    if (!share) {
      throw new NotFoundException('Expense share not found');
    }

    if (share.expenseId !== expenseId || share.expense.tripId !== tripId) {
      throw new NotFoundException('Expense share not found');
    }

    if (share.userId !== userId) {
      throw new ForbiddenException(
        'Only the share owner can settle their share',
      );
    }

    const updated = await this.prisma.expenseShare.update({
      where: { id: shareId },
      data: {
        isSettled: dto.isSettled,
        settledAt: dto.isSettled ? new Date() : null,
      },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    this.activityService.log(
      tripId,
      userId,
      ActivityAction.EXPENSE_SETTLED,
      shareId,
      {
        displayName: updated.user.displayName,
        isSettled: dto.isSettled,
      },
    );

    if (dto.isSettled) {
      // On an ENDED trip this settle may have been the last unsettled share —
      // trip_settled re-checks the full predicate internally.
      void this.missions.onTripPossiblySettled(tripId);
    }

    return this.formatShare(updated);
  }

  async getTripBreakdown(
    tripId: number,
    userId: number,
  ): Promise<TripBreakdownDto> {
    await this.assertMember(tripId, userId);

    const [expenses, members, budgets] = await Promise.all([
      this.prisma.expense.findMany({
        where: { tripId },
        include: EXPENSE_DETAIL_INCLUDE,
      }),
      this.prisma.tripMember.findMany({
        where: { tripId, inviteStatus: InviteStatus.ACCEPTED },
        include: {
          user: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
        },
      }),
      this.prisma.budget.findMany({
        where: { tripId },
        include: { payments: true },
      }),
    ]);

    const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

    const memberBreakdowns: MemberBreakdownDto[] = members.map((member) => {
      const memberUserId = member.user.id;

      const totalDeposit = budgets.reduce((sum, budget) => {
        const payment = budget.payments.find(
          (p) => p.userId === memberUserId && p.isPaid,
        );
        return sum + (payment ? Number(payment.amount) : 0);
      }, 0);

      const totalPaid = expenses
        .filter((e) => e.paidBy?.id === memberUserId)
        .reduce((sum, e) => sum + Number(e.amount), 0);

      const memberExpenses: BreakdownExpenseItemDto[] = [];
      let totalShare = 0;
      let allSettled = true;

      for (const expense of expenses) {
        for (const share of expense.shares) {
          if (share.user.id === memberUserId) {
            const shareAmount = Number(share.shareAmount);
            totalShare += shareAmount;
            if (!share.isSettled) allSettled = false;
            memberExpenses.push({
              expenseId: expense.id,
              expenseName: expense.name,
              shareAmount,
              isSettled: share.isSettled,
              shareId: share.id,
            });
          }
        }
      }

      return {
        userId: memberUserId,
        displayName: member.user.displayName,
        avatarUrl: member.user.avatarUrl,
        totalDeposit: Math.round(totalDeposit * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        totalShare: Math.round(totalShare * 100) / 100,
        netBalance: Math.round((totalDeposit - totalShare) * 100) / 100,
        isAllSettled: memberExpenses.length === 0 || allSettled,
        expenses: memberExpenses,
      };
    });

    const unsettledCount = memberBreakdowns.filter(
      (m) => !m.isAllSettled,
    ).length;

    return {
      totalSpent: Math.round(totalSpent * 100) / 100,
      unsettledCount,
      members: memberBreakdowns,
    };
  }

  async settleAllShares(
    tripId: number,
    userId: number,
  ): Promise<TripBreakdownDto> {
    await this.assertMember(tripId, userId);

    await this.prisma.expenseShare.updateMany({
      where: {
        userId,
        isSettled: false,
        expense: { tripId },
      },
      data: {
        isSettled: true,
        settledAt: new Date(),
      },
    });

    this.activityService.log(
      tripId,
      userId,
      ActivityAction.EXPENSE_SETTLED,
      undefined,
      { bulk: true },
    );
    this.tripsHandler.sendTripSettlementUpdated(tripId);
    void this.missions.onTripPossiblySettled(tripId);

    return this.getTripBreakdown(tripId, userId);
  }

  /**
   * Pairwise, current-user-POV settlement view. An expense share's implicit
   * counterparty is the expense payer: "receive from X" = X's shares on expenses
   * the caller paid; "pay X" = the caller's shares on expenses X paid.
   */
  async getTripSettlements(
    tripId: number,
    userId: number,
  ): Promise<TripSettlementSummaryDto> {
    await this.assertMember(tripId, userId);

    const [expenses, groupBudgets] = await Promise.all([
      this.prisma.expense.findMany({
        where: { tripId },
        include: EXPENSE_DETAIL_INCLUDE,
      }),
      // GROUP-scope budgets fund the shared wallet; PERSONAL budgets are the
      // member's own set-aside money and must NOT count as a group deposit.
      this.prisma.budget.findMany({
        where: { tripId, scope: PlanScope.GROUP },
        include: { payments: true },
      }),
    ]);

    // One netted row per counterparty: what they owe me (they share expenses I
    // paid) minus what I owe them (I share expenses they paid).
    type PersonAcc = {
      party: { id: number; displayName: string; avatarUrl: string | null };
      receiveTotal: number;
      payTotal: number;
      allSettled: boolean;
      items: CounterpartySettlementDto['items'];
    };
    const perPerson = new Map<number, PersonAcc>();
    const accFor = (party: {
      id: number;
      displayName: string;
      avatarUrl: string | null;
    }): PersonAcc => {
      let acc = perPerson.get(party.id);
      if (!acc) {
        acc = {
          party,
          receiveTotal: 0,
          payTotal: 0,
          allSettled: true,
          items: [],
        };
        perPerson.set(party.id, acc);
      }
      return acc;
    };

    for (const expense of expenses) {
      const payerId = expense.paidBy?.id ?? null;
      for (const share of expense.shares) {
        const amount = Number(share.shareAmount);
        let acc: PersonAcc | null = null;
        let owedToYou = false;
        if (payerId === userId && share.user.id !== userId) {
          // They owe me for an expense I paid.
          acc = accFor(share.user);
          acc.receiveTotal += amount;
          owedToYou = true;
        } else if (
          payerId != null &&
          payerId !== userId &&
          share.user.id === userId
        ) {
          // I owe the payer for an expense they paid.
          acc = accFor(expense.paidBy!);
          acc.payTotal += amount;
          owedToYou = false;
        }
        if (!acc) continue;
        if (!share.isSettled) acc.allSettled = false;
        acc.items.push({
          expenseId: expense.id,
          expenseName: expense.name,
          shareAmount: amount,
          isSettled: share.isSettled,
          shareId: share.id,
          owedToYou,
        });
      }
    }

    const personRows: CounterpartySettlementDto[] = Array.from(
      perPerson.values(),
    )
      .map<CounterpartySettlementDto>((acc) => {
        const net = Math.round((acc.receiveTotal - acc.payTotal) * 100) / 100;
        return {
          counterpartyUserId: acc.party.id,
          displayName: acc.party.displayName,
          avatarUrl: acc.party.avatarUrl,
          isGroup: false,
          direction: net >= 0 ? 'receive' : 'pay',
          totalAmount: Math.abs(net),
          isSettled: acc.allSettled,
          items: acc.items,
        };
      })
      // Unsettled first, then by amount descending.
      .sort((a, b) => {
        if (a.isSettled !== b.isSettled) return a.isSettled ? 1 : -1;
        return b.totalAmount - a.totalAmount;
      });

    // Synthetic "Group" counterparty: the shared wallet. My position with it is
    // what I deposited (GROUP budget payments I paid) minus what I consumed of
    // group-paid expenses (paidBy = null). Positive → the wallet refunds me.
    const groupItems: CounterpartySettlementDto['items'] = [];
    for (const expense of expenses) {
      if (expense.paidBy?.id != null) continue; // person-paid → pairwise above
      for (const share of expense.shares) {
        if (share.user.id !== userId) continue;
        groupItems.push({
          expenseId: expense.id,
          expenseName: expense.name,
          shareAmount: Number(share.shareAmount),
          isSettled: share.isSettled,
          shareId: share.id,
          owedToYou: false, // consumption from the wallet
        });
      }
    }
    const myGroupConsumption = groupItems.reduce(
      (sum, i) => sum + i.shareAmount,
      0,
    );
    const myDeposits = groupBudgets.reduce((sum, budget) => {
      const payment = budget.payments.find(
        (p) => p.userId === userId && p.isPaid,
      );
      return sum + (payment ? Number(payment.amount) : 0);
    }, 0);
    const groupNet = Math.round((myDeposits - myGroupConsumption) * 100) / 100;

    const groupRow: CounterpartySettlementDto | null =
      groupNet !== 0 || groupItems.length > 0
        ? {
            counterpartyUserId: 0,
            displayName: 'Group',
            avatarUrl: null,
            isGroup: true,
            direction: groupNet >= 0 ? 'receive' : 'pay',
            totalAmount: Math.abs(groupNet),
            isSettled:
              groupItems.length > 0
                ? groupItems.every((i) => i.isSettled)
                : true,
            items: groupItems,
          }
        : null;

    return {
      settlements: [...(groupRow ? [groupRow] : []), ...personRows],
    };
  }

  /**
   * Settle every unsettled share between the caller and one counterparty, in a
   * single direction. Both parties are authorized: 'pay' settles the caller's
   * own shares; 'receive' settles the counterparty's shares on expenses the
   * caller paid (creditor confirming receipt).
   */
  async settleCounterparty(
    tripId: number,
    userId: number,
    dto: SettleCounterpartyDto,
  ): Promise<TripSettlementSummaryDto> {
    await this.assertMember(tripId, userId);

    let where: Prisma.ExpenseShareWhereInput;
    if (dto.isGroup) {
      // Group wallet: settle my own shares of group-paid (null-payer) expenses.
      where = {
        userId,
        isSettled: false,
        expense: { tripId, paidById: null },
      };
    } else {
      // Person rows are netted, so settle BOTH directions with this counterparty:
      // my shares of their expenses, and their shares of my expenses.
      where = {
        isSettled: false,
        OR: [
          { userId, expense: { tripId, paidById: dto.counterpartyUserId } },
          {
            userId: dto.counterpartyUserId,
            expense: { tripId, paidById: userId },
          },
        ],
      };
    }

    await this.prisma.expenseShare.updateMany({
      where,
      data: { isSettled: true, settledAt: new Date() },
    });

    this.activityService.log(
      tripId,
      userId,
      ActivityAction.EXPENSE_SETTLED,
      undefined,
      { counterpartyUserId: dto.counterpartyUserId, direction: dto.direction },
    );
    this.tripsHandler.sendTripSettlementUpdated(tripId);
    void this.missions.onTripPossiblySettled(tripId);

    return this.getTripSettlements(tripId, userId);
  }

  // ── Private helpers ──────────────────────────────────────────────

  /// Resolves who the expense is recorded against.
  ///
  /// Defaults to the caller, preserving the previous hardcoded behaviour. A
  /// supplied payer must be an ACCEPTED member of the trip. This throws 400
  /// rather than 403 on purpose: the caller IS authorised (assertMember already
  /// ran) — it is the payload that names someone who cannot be the payer.
  private async resolvePayer(
    tripId: number,
    callerId: number,
    paidById?: number,
    paidByGroup?: boolean,
  ): Promise<number | null> {
    // Explicit "paid by the shared group wallet" — stored as no individual payer.
    if (paidByGroup === true) {
      return null;
    }

    if (paidById === undefined || paidById === callerId) {
      return callerId;
    }

    const payer = await this.prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId: paidById } },
    });

    if (!payer || payer.inviteStatus !== InviteStatus.ACCEPTED) {
      throw new BadRequestException(
        'Payer is not an accepted member of this trip',
      );
    }

    return paidById;
  }

  private async assertMember(tripId: number, userId: number): Promise<void> {
    const member = await this.prisma.tripMember.findUnique({
      where: { tripId_userId: { tripId, userId } },
    });

    if (!member || member.inviteStatus !== InviteStatus.ACCEPTED) {
      throw new ForbiddenException('You are not a member of this trip');
    }
  }

  private async assertExpenseBelongsToTrip(
    expenseId: number,
    tripId: number,
  ): Promise<{ id: number; name: string }> {
    const expense = await this.prisma.expense.findUnique({
      where: { id: expenseId },
      select: { id: true, name: true, tripId: true },
    });

    if (!expense || expense.tripId !== tripId) {
      throw new NotFoundException('Expense not found');
    }

    return { id: expense.id, name: expense.name };
  }

  private async findExpenseDetail(expenseId: number): Promise<ExpenseDto> {
    const expense = await this.prisma.expense.findUniqueOrThrow({
      where: { id: expenseId },
      include: EXPENSE_DETAIL_INCLUDE,
    });

    return this.formatExpense(expense);
  }

  private async formatExpense(expense: {
    id: number;
    tripId: number;
    name: string;
    amount: any;
    category: ExpenseCategory;
    note: string | null;
    receiptUrl: string | null;
    originalAmount?: any;
    originalCurrency?: Currency | null;
    exchangeRate?: any;
    expenseDate: Date;
    createdAt: Date;
    paidBy: {
      id: number;
      displayName: string;
      avatarUrl: string | null;
    } | null;
    shares: Array<{
      id: number;
      userId: number;
      shareAmount: any;
      isSettled: boolean;
      settledAt: Date | null;
      user: { id: number; displayName: string; avatarUrl: string | null };
    }>;
  }): Promise<ExpenseDto> {
    return {
      id: expense.id,
      tripId: expense.tripId,
      name: expense.name,
      amount: Number(expense.amount),
      category: expense.category,
      note: expense.note,
      receiptUrl: expense.receiptUrl,
      expenseDate: expense.expenseDate.toISOString(),
      createdAt: expense.createdAt.toISOString(),
      paidBy: expense.paidBy
        ? {
            userId: expense.paidBy.id,
            displayName: expense.paidBy.displayName,
            avatarUrl: await this.resolveAvatarUrl(expense.paidBy.avatarUrl),
          }
        : // A null payer means the shared group wallet paid (not a deleted user).
          { userId: null, displayName: 'Group', avatarUrl: null },
      shares: await Promise.all(
        expense.shares.map((share) => this.formatShare(share)),
      ),
      originalAmount:
        expense.originalAmount !== null && expense.originalAmount !== undefined
          ? Number(expense.originalAmount)
          : undefined,
      originalCurrency: expense.originalCurrency ?? undefined,
      exchangeRate:
        expense.exchangeRate !== null && expense.exchangeRate !== undefined
          ? Number(expense.exchangeRate)
          : undefined,
    };
  }

  private async formatExpenseSummary(expense: {
    id: number;
    name: string;
    amount: any;
    category: ExpenseCategory;
    expenseDate: Date;
    createdAt: Date;
    paidBy: {
      id: number;
      displayName: string;
      avatarUrl: string | null;
    } | null;
    shares: Array<{
      user: { id: number; avatarUrl: string | null };
    }>;
  }): Promise<ExpenseSummaryDto> {
    const sharedMembers: SharedMemberPreviewDto[] = await Promise.all(
      expense.shares.map(async (share) => ({
        userId: share.user.id,
        avatarUrl: await this.resolveAvatarUrl(share.user.avatarUrl),
      })),
    );

    return {
      id: expense.id,
      name: expense.name,
      amount: Number(expense.amount),
      category: expense.category,
      expenseDate: expense.expenseDate.toISOString(),
      createdAt: expense.createdAt.toISOString(),
      paidBy: expense.paidBy
        ? {
            userId: expense.paidBy.id,
            displayName: expense.paidBy.displayName,
            avatarUrl: await this.resolveAvatarUrl(expense.paidBy.avatarUrl),
          }
        : // A null payer means the shared group wallet paid (not a deleted user).
          { userId: null, displayName: 'Group', avatarUrl: null },
      sharedMembers,
    };
  }

  private async formatShare(share: {
    id: number;
    userId: number;
    shareAmount: any;
    isSettled: boolean;
    settledAt: Date | null;
    user: { id: number; displayName: string; avatarUrl: string | null };
  }): Promise<ExpenseShareDto> {
    return {
      id: share.id,
      userId: share.user.id,
      displayName: share.user.displayName,
      avatarUrl: await this.resolveAvatarUrl(share.user.avatarUrl),
      shareAmount: Number(share.shareAmount),
      isSettled: share.isSettled,
      settledAt: share.settledAt?.toISOString() ?? null,
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

  /**
   * Creates an expense on behalf of the vault, splitting it across the members
   * chosen at prepare time. Lives here rather than in the vault module so share
   * splitting has exactly one implementation.
   *
   * Called only after the payout confirms, which may be the reconciliation cron
   * minutes later, so every input comes from the stored VaultTransaction row.
   */
  async createFromVault(input: {
    tripId: number;
    paidByUserId?: number;
    amountVnd: bigint;
    /** What actually left the vault. This is the value the ledger records. */
    amountUsdcMicro: bigint;
    /** VND per USDC at the time the payment was priced. */
    rate: string | null;
    name: string;
    category: ExpenseCategory;
    shareWithUserIds: number[];
  }): Promise<{ id: number }> {
    const memberIds = input.shareWithUserIds.length
      ? input.shareWithUserIds
      : input.paidByUserId
        ? [input.paidByUserId]
        : [];

    // The trip's ledger is kept in the trip's currency. Writing the dong figure
    // into it made a ten thousand dong coffee read as ten thousand dollars on a
    // USD trip — the amount is only meaningful next to its currency.
    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: input.tripId },
      select: { currency: true },
    });
    const usd = Number(input.amountUsdcMicro) / 1_000_000;
    const amountInTripCurrency =
      trip.currency === Currency.USD
        ? usd
        : trip.currency === Currency.VND
          ? Number(input.amountVnd)
          : Number(
              await this.exchangeRatesService.convertToHome(
                new Prisma.Decimal(usd),
                Currency.USD,
                trip.currency,
              ),
            );

    const shares = this.splitAmount(amountInTripCurrency, memberIds.length);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          tripId: input.tripId,
          paidById: input.paidByUserId ?? null,
          name: input.name,
          amount: amountInTripCurrency.toFixed(2),
          category: input.category,
          // What was really handed over, kept beside the converted figure so a
          // receipt can show the dong the merchant was paid.
          originalAmount: input.amountVnd.toString(),
          originalCurrency: Currency.VND,
          exchangeRate: input.rate ?? undefined,
        },
        select: { id: true },
      });

      if (memberIds.length) {
        await tx.expenseShare.createMany({
          data: memberIds.map((userId, index) => ({
            expenseId: created.id,
            userId,
            shareAmount: shares[index],
          })),
        });
      }

      return created;
    });
  }

  splitAmount(total: number, count: number): number[] {
    if (count <= 0) return [];
    const base = Math.floor((total * 100) / count) / 100;
    const shares = Array(count).fill(base);
    const remainder = Math.round((total - base * count) * 100) / 100;
    if (remainder > 0) {
      shares[0] = Math.round((shares[0] + remainder) * 100) / 100;
    }
    return shares;
  }

  /**
   * Scales each existing share proportionally to a new total, preserving
   * the relative distribution instead of re-splitting equally. Rounding
   * residual goes to shares[0] (lowest id, same convention as
   * splitAmount's remainder) so shares always sum exactly to newTotal.
   * Falls back to an equal split if the existing shares sum to 0 (nothing
   * to scale proportionally from).
   */
  private scaleShares(
    currentShares: Array<{ shareAmount: Prisma.Decimal | number }>,
    newTotal: number,
  ): number[] {
    if (currentShares.length === 0) return [];

    const oldTotal = currentShares.reduce(
      (sum, share) => sum + Number(share.shareAmount),
      0,
    );
    if (oldTotal <= 0) {
      return this.splitAmount(newTotal, currentShares.length);
    }

    const scaled = currentShares.map(
      (share) =>
        Math.round((Number(share.shareAmount) / oldTotal) * newTotal * 100) /
        100,
    );
    const scaledSum = Math.round(scaled.reduce((a, b) => a + b, 0) * 100) / 100;
    const residual = Math.round((newTotal - scaledSum) * 100) / 100;
    if (residual !== 0) {
      scaled[0] = Math.round((scaled[0] + residual) * 100) / 100;
    }
    return scaled;
  }
}
