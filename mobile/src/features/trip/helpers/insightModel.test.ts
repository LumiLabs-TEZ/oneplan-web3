import type { BudgetDto, ExpenseSummaryDto, TripBreakdownDto } from '../types';
import { groupInsight, orderedCategories, personalInsight } from './insightModel';

function expense(
  id: number,
  amount: number,
  category: ExpenseSummaryDto['category'],
): ExpenseSummaryDto {
  return {
    id,
    name: `Expense ${id}`,
    amount,
    category,
    expenseDate: '2026-03-10',
    createdAt: '2026-03-10T08:00:00.000Z',
    sharedMembers: [],
  };
}

function budget(id: number, payments: { isPaid: boolean; amount: number }[]): BudgetDto {
  return {
    id,
    tripId: 1,
    name: `Budget ${id}`,
    amount: payments.reduce((s, p) => s + p.amount, 0),
    scope: 'GROUP',
    createdAt: '2026-03-10T08:00:00.000Z',
    payments: payments.map((p, i) => ({
      id: id * 10 + i,
      userId: i + 1,
      displayName: `User ${i + 1}`,
      amount: p.amount,
      isPaid: p.isPaid,
    })),
  };
}

function breakdown(members: TripBreakdownDto['members']): TripBreakdownDto {
  return { totalSpent: 0, unsettledCount: 0, members };
}

describe('personalInsight', () => {
  it('returns null when the current user has no breakdown member row', () => {
    const result = personalInsight(breakdown([]), [], 1);
    expect(result).toBeNull();
  });

  it('uses totalShare / netBalance and folds shareAmount by category', () => {
    const data = breakdown([
      {
        userId: 1,
        displayName: 'Me',
        totalDeposit: 0,
        totalPaid: 0,
        totalShare: 300_000,
        netBalance: -50_000,
        isAllSettled: false,
        expenses: [
          {
            expenseId: 1,
            expenseName: 'Dinner',
            shareAmount: 200_000,
            isSettled: false,
            shareId: 1,
          },
          { expenseId: 2, expenseName: 'Taxi', shareAmount: 100_000, isSettled: false, shareId: 2 },
        ],
      },
    ]);
    const expenses = [expense(1, 400_000, 'FOOD'), expense(2, 150_000, 'TRANSPORT')];

    const result = personalInsight(data, expenses, 1);

    expect(result).not.toBeNull();
    expect(result?.myExpenses).toBe(300_000);
    expect(result?.remaining).toBe(-50_000);
    expect(result?.isOver).toBe(true);
    const total = result?.categories.reduce((s, c) => s + c.amount, 0);
    expect(total).toBe(300_000);
    expect(result?.categories).toEqual([
      { category: 'FOOD', amount: 200_000 },
      { category: 'TRANSPORT', amount: 100_000 },
    ]);
  });

  it('is not over when remaining is exactly zero', () => {
    const data = breakdown([
      {
        userId: 1,
        displayName: 'Me',
        totalDeposit: 0,
        totalPaid: 0,
        totalShare: 100_000,
        netBalance: 0,
        isAllSettled: true,
        expenses: [],
      },
    ]);

    const result = personalInsight(data, [], 1);
    expect(result?.isOver).toBe(false);
  });

  it('falls back to OTHER when the expense is missing from the list', () => {
    const data = breakdown([
      {
        userId: 1,
        displayName: 'Me',
        totalDeposit: 0,
        totalPaid: 0,
        totalShare: 100_000,
        netBalance: 100_000,
        isAllSettled: false,
        expenses: [
          {
            expenseId: 99,
            expenseName: 'Unknown',
            shareAmount: 100_000,
            isSettled: false,
            shareId: 1,
          },
        ],
      },
    ]);

    const result = personalInsight(data, [], 1);
    expect(result?.categories).toEqual([{ category: 'OTHER', amount: 100_000 }]);
  });
});

describe('groupInsight', () => {
  it('uses tripMoney totals and folds expense.amount by category', () => {
    const budgets = [budget(1, [{ isPaid: true, amount: 1_000_000 }])];
    const expenses = [
      expense(1, 300_000, 'FOOD'),
      expense(2, 200_000, 'FOOD'),
      expense(3, 100_000, 'STAY'),
    ];

    const result = groupInsight(breakdown([]), budgets, expenses);

    expect(result.totalBudget).toBe(1_000_000);
    expect(result.totalSpent).toBe(600_000);
    expect(result.remaining).toBe(400_000);
    expect(result.categories).toEqual([
      { category: 'FOOD', amount: 500_000 },
      { category: 'STAY', amount: 100_000 },
    ]);
  });
});

describe('orderedCategories', () => {
  it('drops zero amounts and keeps canonical order with OTHER last', () => {
    const result = orderedCategories({ OTHER: 10, FOOD: 0, STAY: 20, TICKET: 0 });
    expect(result).toEqual([
      { category: 'STAY', amount: 20 },
      { category: 'OTHER', amount: 10 },
    ]);
  });

  it('returns an empty list when everything is zero or missing', () => {
    expect(orderedCategories({})).toEqual([]);
  });
});
