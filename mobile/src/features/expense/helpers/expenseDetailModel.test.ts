import type { components } from '@/api/schema';
import { CURRENCIES } from '@/lib/currency';

import {
  budgetPercent,
  buildExpenseDetailModel,
  expensePayer,
  expenseScope,
  formatEditExpenseTime,
  formatExpenseTime,
  heroAmount,
  myShareAmount,
  originalAmount,
  originalCaption,
} from './expenseDetailModel';

type ExpenseDto = components['schemas']['ExpenseDto'];

function expense(overrides: Partial<ExpenseDto> = {}): ExpenseDto {
  return {
    id: 7,
    tripId: 1,
    name: 'Dinner',
    amount: 1955000,
    category: 'FOOD',
    expenseDate: '2026-03-10T10:00:00.000Z',
    createdAt: '2026-03-10T10:00:00.000Z',
    paidBy: { userId: 1, displayName: 'Ken', avatarUrl: 'https://cdn/ken.png' },
    shares: [
      { id: 1, userId: 1, displayName: 'Ken', shareAmount: 977500, isSettled: false },
      { id: 2, userId: 2, displayName: 'Ann', shareAmount: 977500, isSettled: false },
    ],
    ...overrides,
  };
}

describe('heroAmount', () => {
  it('splits symbol / signed whole / decimal for 2-decimal currencies', () => {
    expect(heroAmount(1234.5, CURRENCIES.USD)).toEqual({
      symbol: '$',
      whole: '-1,234',
      decimal: '.50',
      amount: 1234.5,
      currency: CURRENCIES.USD,
    });
  });
  it('omits the decimal part for 0-decimal currencies', () => {
    expect(heroAmount(1955000, CURRENCIES.VND)).toEqual({
      symbol: 'đ',
      whole: '-1,955,000',
      decimal: null,
      amount: 1955000,
      currency: CURRENCIES.VND,
    });
  });
});

describe('originalCaption', () => {
  it('formats a non-home original pair', () => {
    expect(
      originalCaption({ originalAmount: 123.4, originalCurrency: 'USD' }, CURRENCIES.VND),
    ).toBe('~123.40 USD');
    expect(
      originalCaption({ originalAmount: 250000, originalCurrency: 'VND' }, CURRENCIES.USD),
    ).toBe('~250,000 VND');
  });
  it('is null when missing or already in the home currency', () => {
    expect(originalCaption({}, CURRENCIES.VND)).toBeNull();
    expect(originalCaption({ originalAmount: 5, originalCurrency: 'VND' }, CURRENCIES.VND)).toBe(
      null,
    );
    expect(originalCaption({ originalCurrency: 'USD' }, CURRENCIES.VND)).toBeNull();
  });
});

describe('originalAmount', () => {
  it('returns the non-home pair as numbers', () => {
    expect(
      originalAmount({ originalAmount: 123.4, originalCurrency: 'USD' }, CURRENCIES.VND),
    ).toEqual({ amount: 123.4, currency: CURRENCIES.USD });
  });
  it('is null when missing or already in the home currency', () => {
    expect(originalAmount({}, CURRENCIES.VND)).toBeNull();
    expect(
      originalAmount({ originalAmount: 5, originalCurrency: 'VND' }, CURRENCIES.VND),
    ).toBeNull();
  });
});

describe('expenseScope', () => {
  it('is All when shares cover every accepted member', () => {
    expect(expenseScope(2, 2)).toEqual({ type: 'all' });
    expect(expenseScope(3, 2)).toEqual({ type: 'all' });
  });
  it('counts members otherwise (and when the trip has no accepted members)', () => {
    expect(expenseScope(1, 3)).toEqual({ type: 'members', count: 1 });
    expect(expenseScope(2, 0)).toEqual({ type: 'members', count: 2 });
  });
});

describe('budgetPercent', () => {
  it('is null without budgets or with a zero total', () => {
    expect(budgetPercent(100, [])).toBeNull();
    expect(budgetPercent(100, [{ amount: 0 }])).toBeNull();
  });
  it('truncates and clamps to 100', () => {
    expect(budgetPercent(333, [{ amount: 500 }, { amount: 500 }])).toBe(33);
    expect(budgetPercent(2000, [{ amount: 1000 }])).toBe(100);
    expect(budgetPercent(0, [{ amount: 1000 }])).toBe(0);
  });
});

describe('myShareAmount / expensePayer', () => {
  const shares = expense().shares;
  it('finds the signed-in user share', () => {
    expect(myShareAmount(shares, 2)).toBe(977500);
    expect(myShareAmount(shares, 9)).toBeNull();
    expect(myShareAmount(shares, null)).toBeNull();
  });
  it('maps a null payer to the group wallet', () => {
    expect(expensePayer(null)).toEqual({ type: 'group' });
    expect(expensePayer({ userId: null, displayName: 'Group' })).toEqual({ type: 'group' });
    expect(expensePayer({ userId: 1, displayName: 'Ken' })).toEqual({
      type: 'member',
      displayName: 'Ken',
      avatarUrl: null,
    });
  });
});

describe('buildExpenseDetailModel', () => {
  it('assembles the full model', () => {
    const model = buildExpenseDetailModel({
      expense: expense({ originalAmount: 80, originalCurrency: 'USD' }),
      homeCurrency: CURRENCIES.VND,
      budgets: [{ amount: 19550000 }],
      memberCount: 3,
      meId: 1,
    });
    expect(model).toEqual({
      hero: {
        symbol: 'đ',
        whole: '-1,955,000',
        decimal: null,
        amount: 1955000,
        currency: CURRENCIES.VND,
      },
      originalCaption: '~80.00 USD',
      original: { amount: 80, currency: CURRENCIES.USD },
      myShare: 977500,
      myShareLabel: '-977,500đ',
      scope: { type: 'members', count: 2 },
      budgetPercent: 10,
      payer: { type: 'member', displayName: 'Ken', avatarUrl: 'https://cdn/ken.png' },
    });
  });
  it('hides share and budget rows when not applicable', () => {
    const model = buildExpenseDetailModel({
      expense: expense({ paidBy: null }),
      homeCurrency: CURRENCIES.VND,
      budgets: [],
      memberCount: 2,
      meId: 42,
    });
    expect(model.myShare).toBeNull();
    expect(model.myShareLabel).toBeNull();
    expect(model.budgetPercent).toBeNull();
    expect(model.scope).toEqual({ type: 'all' });
    expect(model.payer).toEqual({ type: 'group' });
  });
});

describe('formatExpenseTime', () => {
  it('joins short time and medium date', () => {
    expect(formatExpenseTime('2026-06-02T15:30:00.000Z', 'en-US', 'UTC')).toBe(
      '3:30 PM - Jun 2, 2026',
    );
  });
  it('follows the device region and clock (iOS Locale.current)', () => {
    expect(formatExpenseTime('2026-08-06T11:41:00.000Z', 'en-GB', 'UTC', false)).toBe(
      '11:41 am - 6 Aug 2026',
    );
    expect(formatExpenseTime('2026-08-06T13:41:00.000Z', 'en-GB', 'UTC', true)).toBe(
      '13:41 - 6 Aug 2026',
    );
  });
  it('returns unparseable input verbatim', () => {
    expect(formatExpenseTime('nope', 'en-US')).toBe('nope');
  });
});

describe('formatEditExpenseTime', () => {
  it('uses the fixed HH:mm - dd/MM/yyyy form in local time', () => {
    const iso = new Date(2026, 7, 6, 11, 41).toISOString();
    expect(formatEditExpenseTime(iso)).toBe('11:41 - 06/08/2026');
  });
  it('returns unparseable input verbatim', () => {
    expect(formatEditExpenseTime('nope')).toBe('nope');
  });
});
