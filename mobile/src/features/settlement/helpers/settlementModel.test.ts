import type { components } from '@/api/schema';

import {
  directionLabel,
  parseLeaveSettlement,
  durationDays,
  itemAmountText,
  leaveTotals,
  rowKey,
  unsettledCountFor,
} from './settlementModel';

type CounterpartySettlementDto = components['schemas']['CounterpartySettlementDto'];
type SettlementItemDto = components['schemas']['SettlementItemDto'];
type LeaveSettlementDto = components['schemas']['LeaveSettlementDto'];
type TripDto = components['schemas']['TripDto'];
type PlanItemDto = components['schemas']['PlanItemDto'];

const t = (key: string) => key;

function counterparty(over: Partial<CounterpartySettlementDto> = {}): CounterpartySettlementDto {
  return {
    counterpartyUserId: 7,
    displayName: 'Shin',
    avatarUrl: null,
    isGroup: false,
    direction: 'receive',
    totalAmount: 1000,
    isSettled: false,
    items: [],
    ...over,
  };
}

function item(over: Partial<SettlementItemDto> = {}): SettlementItemDto {
  return {
    expenseId: 1,
    expenseName: 'Dinner',
    shareAmount: 1_500_000,
    isSettled: false,
    shareId: 11,
    owedToYou: true,
    ...over,
  };
}

function trip(over: Partial<TripDto> = {}): TripDto {
  return {
    id: 1,
    name: 'Da Lat',
    status: 'ENDED',
    createdById: 1,
    createdAt: '2026-03-01T00:00:00.000Z',
    currency: 'VND',
    localCurrencies: [],
    web3: false,
    marketplaceListingId: null,
    userMarketplaceRating: null,
    members: [],
    ...over,
  };
}

function planItem(dayNumber: number): PlanItemDto {
  return { dayNumber } as PlanItemDto;
}

describe('rowKey', () => {
  it('prefixes receive rows with r and pay rows with p', () => {
    expect(rowKey(counterparty({ direction: 'receive', counterpartyUserId: 3 }))).toBe('r-3');
    expect(rowKey(counterparty({ direction: 'pay', counterpartyUserId: 3 }))).toBe('p-3');
  });

  it('keeps both directions for the same person distinct', () => {
    const a = rowKey(counterparty({ direction: 'receive', counterpartyUserId: 9 }));
    const b = rowKey(counterparty({ direction: 'pay', counterpartyUserId: 9 }));
    expect(a).not.toBe(b);
  });
});

describe('directionLabel', () => {
  it('switches the receive label when the row is expanded', () => {
    expect(directionLabel('receive', false, t)).toBe('Receive from');
    expect(directionLabel('receive', true, t)).toBe('You receive from');
  });

  it('always says Transfer to when paying', () => {
    expect(directionLabel('pay', false, t)).toBe('Transfer to');
    expect(directionLabel('pay', true, t)).toBe('Transfer to');
  });
});

describe('itemAmountText', () => {
  it('renders + and green when the counterparty owes you', () => {
    expect(itemAmountText(item({ owedToYou: true, shareAmount: 1_500_000 }), 'đ')).toEqual({
      text: '+1,500,000đ',
      sign: '+',
      amount: 1_500_000,
      tone: 'green',
    });
  });

  it('renders - and orange when you owe', () => {
    expect(itemAmountText(item({ owedToYou: false, shareAmount: 200_000 }), 'đ')).toEqual({
      text: '-200,000đ',
      sign: '-',
      amount: 200_000,
      tone: 'orange',
    });
  });
});

describe('leaveTotals', () => {
  const base: LeaveSettlementDto = {
    displayName: 'Ken',
    totalBudgetRefund: 500_000,
    totalExpenseShare: 200_000,
    netSettlement: 300_000,
    expenses: [
      { expenseName: 'Dinner', shareAmount: 150_000, isSettled: false },
      { expenseName: 'Taxi', shareAmount: 50_000, isSettled: true },
    ],
  };

  it('sums every expense share', () => {
    expect(leaveTotals(base).totalShare).toBe(200_000);
  });

  it('is not all-settled while a share is open or the net is non-zero', () => {
    expect(leaveTotals(base).isAllSettled).toBe(false);
    expect(
      leaveTotals({
        ...base,
        netSettlement: 0,
        expenses: base.expenses.map((e) => ({ ...e, isSettled: false })),
      }).isAllSettled,
    ).toBe(false);
    expect(leaveTotals({ ...base, netSettlement: 300_000 }).isAllSettled).toBe(false);
  });

  it('is all-settled when every share is settled and the net is zero', () => {
    expect(
      leaveTotals({
        ...base,
        netSettlement: 0,
        expenses: base.expenses.map((e) => ({ ...e, isSettled: true })),
      }).isAllSettled,
    ).toBe(true);
  });

  it('treats an empty expense list with a zero net as settled', () => {
    expect(leaveTotals({ ...base, netSettlement: 0, expenses: [] })).toEqual({
      totalShare: 0,
      isAllSettled: true,
    });
  });
});

describe('durationDays', () => {
  it('counts the date range inclusively', () => {
    expect(durationDays(trip({ startDate: '2026-04-01', endDate: '2026-04-04' }), [])).toBe(4);
    expect(durationDays(trip({ startDate: '2026-04-01', endDate: '2026-04-01' }), [])).toBe(1);
  });

  it('accepts ISO timestamps (only the date part matters)', () => {
    expect(
      durationDays(
        trip({ startDate: '2026-04-01T10:00:00.000Z', endDate: '2026-04-03T02:00:00.000Z' }),
        [],
      ),
    ).toBe(3);
  });

  it('falls back to the max plan-item day when there is no range', () => {
    expect(durationDays(trip(), [planItem(1), planItem(5), planItem(3)])).toBe(5);
  });

  it('never goes below 1', () => {
    expect(durationDays(trip(), [])).toBe(1);
    expect(durationDays(undefined, [])).toBe(1);
    expect(durationDays(trip({ startDate: '2026-04-04', endDate: '2026-04-01' }), [])).toBe(1);
  });
});

describe('unsettledCountFor', () => {
  const breakdown = { totalSpent: 0, unsettledCount: 4, members: [] };

  it('is always 1 for a leaving member', () => {
    expect(unsettledCountFor('leaving', breakdown, 9)).toBe(1);
    expect(unsettledCountFor('leaving', undefined, 9)).toBe(1);
  });

  it('prefers the breakdown count otherwise', () => {
    expect(unsettledCountFor('flow', breakdown, 9)).toBe(4);
    expect(unsettledCountFor('ended', breakdown, 9)).toBe(4);
  });

  it('falls back when the breakdown is missing', () => {
    expect(unsettledCountFor('flow', undefined, 9)).toBe(9);
  });
});

describe('parseLeaveSettlement', () => {
  const dto: LeaveSettlementDto = {
    displayName: 'Ken',
    totalBudgetRefund: 500,
    totalExpenseShare: 200,
    netSettlement: 300,
    expenses: [{ expenseName: 'Dinner', shareAmount: 150, isSettled: false }],
  };

  it('round-trips a well-formed param', () => {
    expect(parseLeaveSettlement(JSON.stringify(dto))).toEqual(dto);
  });

  it('returns null for a missing or empty param', () => {
    expect(parseLeaveSettlement(undefined)).toBeNull();
    expect(parseLeaveSettlement('')).toBeNull();
    expect(parseLeaveSettlement(null)).toBeNull();
  });

  it('returns null for invalid JSON or a non-object', () => {
    expect(parseLeaveSettlement('{oops')).toBeNull();
    expect(parseLeaveSettlement('"a string"')).toBeNull();
    expect(parseLeaveSettlement('null')).toBeNull();
    expect(parseLeaveSettlement('[1, 2]')).toBeNull();
  });

  it('returns null when the shape does not match the DTO', () => {
    expect(parseLeaveSettlement(JSON.stringify({ ...dto, expenses: undefined }))).toBeNull();
    expect(parseLeaveSettlement(JSON.stringify({ ...dto, expenses: 'nope' }))).toBeNull();
    expect(parseLeaveSettlement(JSON.stringify({ ...dto, netSettlement: '300' }))).toBeNull();
    expect(parseLeaveSettlement(JSON.stringify({ ...dto, displayName: 42 }))).toBeNull();
    expect(
      parseLeaveSettlement(JSON.stringify({ ...dto, expenses: [{ expenseName: 'x' }] })),
    ).toBeNull();
  });
});
