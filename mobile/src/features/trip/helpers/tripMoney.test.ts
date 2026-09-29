import type { BudgetDto, ExpenseSummaryDto } from '../types';
import { tripMoney } from './tripMoney';

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

function expense(id: number, amount: number): ExpenseSummaryDto {
  return {
    id,
    name: `Expense ${id}`,
    amount,
    category: 'FOOD',
    expenseDate: '2026-03-10',
    createdAt: '2026-03-10T08:00:00.000Z',
    sharedMembers: [],
  };
}

describe('tripMoney', () => {
  it('sums only paid payments into totalBudget and all expenses into totalSpent', () => {
    const budgets = [
      budget(1, [
        { isPaid: true, amount: 1_000_000 },
        { isPaid: false, amount: 500_000 },
      ]),
      budget(2, [{ isPaid: true, amount: 200_000 }]),
    ];
    const expenses = [expense(1, 300_000), expense(2, 400_000)];

    const result = tripMoney(budgets, expenses);

    expect(result.totalBudget).toBe(1_200_000);
    expect(result.totalSpent).toBe(700_000);
    expect(result.balance).toBe(500_000);
    expect(result.unsettledPaymentCount).toBe(1);
  });

  it('computes usagePercent as the remaining-balance percentage, clamped at 0', () => {
    const budgets = [budget(1, [{ isPaid: true, amount: 1_000_000 }])];
    expect(tripMoney(budgets, [expense(1, 300_000)]).usagePercent).toBe(70);
    expect(tripMoney(budgets, [expense(1, 1_500_000)]).usagePercent).toBe(0);
  });

  it('returns zeros when there is no paid budget', () => {
    const result = tripMoney([], []);
    expect(result).toEqual({
      totalBudget: 0,
      totalSpent: 0,
      balance: 0,
      usagePercent: 0,
      unsettledPaymentCount: 0,
    });
  });
});
