import type { components } from '@/api/schema';

import { aggregateDeposits, canTogglePayment, paidProgressSheetHeight } from './deposits';

type BudgetDto = components['schemas']['BudgetDto'];

const payment = (
  userId: number,
  displayName: string,
  amount: number,
  isPaid: boolean,
  avatarUrl: string | null = null,
) => ({ id: userId * 10, userId, displayName, avatarUrl, amount, isPaid, paidAt: null });

const budget = (id: number, payments: ReturnType<typeof payment>[]): BudgetDto =>
  ({
    id,
    tripId: 1,
    name: `Budget ${id}`,
    amount: 0,
    scope: 'GROUP',
    createdAt: '2026-09-10T12:00:00.000Z',
    payments,
  }) as BudgetDto;

describe('aggregateDeposits', () => {
  it('sums paid amounts/counts per member across budgets, sorted by name', () => {
    const budgets = [
      budget(1, [payment(2, 'Bao', 1_000_000, true), payment(1, 'An', 2_000_000, false)]),
      budget(2, [payment(2, 'Bao', 500_000, false), payment(1, 'An', 1_500_000, true)]),
    ];

    const rows = aggregateDeposits(budgets);
    expect(rows.map((r) => r.displayName)).toEqual(['An', 'Bao']);

    const an = rows.find((r) => r.userId === 1)!;
    expect(an.segments).toEqual([false, true]);
    expect(an.paidAmount).toBe(1_500_000);
    expect(an.paidCount).toBe(1);

    const bao = rows.find((r) => r.userId === 2)!;
    expect(bao.segments).toEqual([true, false]);
    expect(bao.paidAmount).toBe(1_000_000);
    expect(bao.paidCount).toBe(1);
  });

  it('returns an empty list for no budgets', () => {
    expect(aggregateDeposits([])).toEqual([]);
  });
});

describe('canTogglePayment', () => {
  it('allows the row owner and the trip creator, not anyone else', () => {
    expect(canTogglePayment(5, 5, 1)).toBe(true);
    expect(canTogglePayment(1, 5, 1)).toBe(true);
    expect(canTogglePayment(7, 5, 1)).toBe(false);
    expect(canTogglePayment(null, 5, 1)).toBe(false);
  });
});

describe('paidProgressSheetHeight', () => {
  it('clamps between 220 and 600 with a 150 + 90×count estimate', () => {
    expect(paidProgressSheetHeight(0)).toBe(220);
    expect(paidProgressSheetHeight(1)).toBe(240);
    expect(paidProgressSheetHeight(10)).toBe(600);
  });
});
