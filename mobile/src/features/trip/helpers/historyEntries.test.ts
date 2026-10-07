import type { components } from '@/api/schema';

import { buildHistorySections, formatDateLabel, type HistoryEntry } from './historyEntries';

type ExpenseSummaryDto = components['schemas']['ExpenseSummaryDto'];
type BudgetDto = components['schemas']['BudgetDto'];
type TripMemberDto = components['schemas']['TripMemberDto'];

const t = (key: string) => key;

// Fixed "now": 2026-03-10 15:00 local.
const now = new Date(2026, 2, 10, 15, 0, 0);

function member(userId: number, inviteStatus: TripMemberDto['inviteStatus'] = 'ACCEPTED') {
  return {
    id: userId * 10,
    userId,
    displayName: `User ${userId}`,
    avatarUrl: null,
    inviteStatus,
    role: 'MEMBER',
    isPro: false,
  } satisfies TripMemberDto;
}

function expense(overrides: Partial<ExpenseSummaryDto> & { id: number }): ExpenseSummaryDto {
  return {
    name: `Expense ${overrides.id}`,
    amount: 1000,
    category: 'FOOD',
    expenseDate: '2026-03-10T10:00:00.000Z',
    createdAt: '2026-03-10T10:00:00.000Z',
    paidBy: { userId: 1, displayName: 'Ken', avatarUrl: 'https://cdn/ken.png' },
    sharedMembers: [{ userId: 1 }, { userId: 2 }],
    ...overrides,
  };
}

function budget(overrides: Partial<BudgetDto> & { id: number }): BudgetDto {
  return {
    tripId: 1,
    name: `Budget ${overrides.id}`,
    amount: 5000,
    scope: 'GROUP',
    createdAt: '2026-03-10T08:00:00.000Z',
    payments: [
      { id: 1, userId: 1, displayName: 'Ken', amount: 2500, isPaid: true },
      { id: 2, userId: 2, displayName: 'Mai', amount: 2500, isPaid: false },
    ],
    ...overrides,
  };
}

const members = [member(1), member(2)];

function build(
  expenses: ExpenseSummaryDto[],
  budgets: BudgetDto[],
  currency: components['schemas']['Currency'] = 'VND',
  mems: TripMemberDto[] = members,
) {
  return buildHistorySections({ expenses, budgets, members: mems, currency, now, t, locale: 'en' });
}

describe('formatDateLabel', () => {
  it('returns Today / Yesterday / "MMM d" around the day boundary', () => {
    expect(formatDateLabel('2026-03-10', now, t, 'en')).toBe('Today');
    expect(formatDateLabel('2026-03-09', now, t, 'en')).toBe('Yesterday');
    expect(formatDateLabel('2026-03-08', now, t, 'en')).toBe('Mar 8');
    expect(formatDateLabel('2026-03-11', now, t, 'en')).toBe('Mar 11');
  });

  it('handles the yesterday boundary across a month start', () => {
    const firstOfMonth = new Date(2026, 3, 1, 0, 30);
    expect(formatDateLabel('2026-03-31', firstOfMonth, t, 'en')).toBe('Yesterday');
    expect(formatDateLabel('2026-04-01', firstOfMonth, t, 'en')).toBe('Today');
  });

  it('formats other days in the requested locale', () => {
    expect(formatDateLabel('2026-03-05', now, t, 'vi')).toMatch(/5/);
    expect(formatDateLabel('2026-03-05', now, t, 'vi')).not.toBe('Mar 5');
  });

  it('returns unparseable keys verbatim', () => {
    expect(formatDateLabel('not-a-date', now, t, 'en')).toBe('not-a-date');
  });
});

describe('buildHistorySections', () => {
  it('groups by dateKey, sections desc, entries desc by timestamp', () => {
    const sections = build(
      [
        expense({ id: 1, expenseDate: '2026-03-08T09:00:00.000Z' }),
        expense({ id: 2, expenseDate: '2026-03-10T09:00:00.000Z' }),
        expense({ id: 3, expenseDate: '2026-03-10T11:30:00.000Z' }),
      ],
      [budget({ id: 7, createdAt: '2026-03-10T10:00:00.000Z' })],
    );

    expect(sections.map((s) => s.dateKey)).toEqual(['2026-03-10', '2026-03-08']);
    expect(sections.map((s) => s.label)).toEqual(['Today', 'Mar 8']);
    expect(sections[0]?.entries.map((e) => `${e.kind}:${e.id}`)).toEqual([
      'expense:3',
      'budget:7',
      'expense:2',
    ]);
    expect(sections[1]?.entries.map((e) => e.id)).toEqual([1]);
  });

  it('returns an empty list when there is nothing to show', () => {
    expect(build([], [])).toEqual([]);
  });

  it('uses dateKey from expenseDate (not createdAt) for expenses', () => {
    const sections = build(
      [
        expense({
          id: 1,
          expenseDate: '2026-03-01T23:00:00.000Z',
          createdAt: '2026-03-10T00:00:00Z',
        }),
      ],
      [],
    );
    expect(sections[0]?.dateKey).toBe('2026-03-01');
  });

  describe('scope', () => {
    it('is "all" when every accepted member shares the expense', () => {
      const [section] = build(
        [expense({ id: 1, sharedMembers: [{ userId: 1 }, { userId: 2 }] })],
        [],
      );
      expect(section?.entries[0]?.scope).toEqual({ type: 'all' });
    });

    it('ignores pending members when counting', () => {
      const [section] = build(
        [expense({ id: 1, sharedMembers: [{ userId: 1 }, { userId: 2 }] })],
        [],
        'VND',
        [member(1), member(2), member(3, 'PENDING')],
      );
      expect(section?.entries[0]?.scope).toEqual({ type: 'all' });
    });

    it('lists avatars when only a subset shares the expense', () => {
      const [section] = build(
        [expense({ id: 1, sharedMembers: [{ userId: 2, avatarUrl: 'https://cdn/mai.png' }] })],
        [],
      );
      expect(section?.entries[0]?.scope).toEqual({
        type: 'members',
        avatars: [{ userId: 2, avatarUrl: 'https://cdn/mai.png' }],
      });
    });

    it('never reports "all" when there are no accepted members', () => {
      const [section] = build([expense({ id: 1, sharedMembers: [] })], [], 'VND', []);
      expect(section?.entries[0]?.scope).toEqual({ type: 'members', avatars: [] });
    });
  });

  describe('payer', () => {
    it('is the member when paidBy has a userId', () => {
      const [section] = build([expense({ id: 1 })], []);
      expect(section?.entries[0]?.payer).toEqual({
        type: 'member',
        displayName: 'Ken',
        avatarUrl: 'https://cdn/ken.png',
      });
    });

    it('is the group when paidBy.userId is null', () => {
      const [section] = build(
        [expense({ id: 1, paidBy: { userId: null, displayName: 'Group' } })],
        [],
      );
      expect(section?.entries[0]?.payer).toEqual({ type: 'group' });
    });

    it('is the group when paidBy is missing entirely', () => {
      const [section] = build([expense({ id: 1, paidBy: null })], []);
      expect(section?.entries[0]?.payer).toEqual({ type: 'group' });
    });

    it('is null for budgets', () => {
      const [section] = build([], [budget({ id: 1 })]);
      expect(section?.entries[0]?.payer).toBeNull();
    });
  });

  describe('amountLabel', () => {
    it('formats VND expenses as -grouped whole + symbol', () => {
      const [section] = build([expense({ id: 1, amount: 1_955_000 })], [], 'VND');
      expect(section?.entries[0]?.amountLabel).toBe('-1,955,000đ');
      expect(section?.entries[0]).toMatchObject({
        amount: 1_955_000,
        amountSign: '-',
        amountCurrency: { code: 'VND' },
      });
    });

    it('keeps cents for USD, so a $1.89 spend never reads as -1$', () => {
      const [section] = build([expense({ id: 1, amount: 1234.56 })], [], 'USD');
      expect(section?.entries[0]?.amountLabel).toBe('-1,234.56$');
      const [small] = build([expense({ id: 2, amount: 1.889 })], [], 'USD');
      expect(small?.entries[0]?.amountLabel).toBe('-1.89$');
    });

    it('formats budgets as +sum of payments', () => {
      const [section] = build([], [budget({ id: 1 })], 'VND');
      expect(section?.entries[0]?.amountLabel).toBe('+5,000đ');
      expect(section?.entries[0]).toMatchObject({ amount: 5000, amountSign: '+' });
    });
  });

  describe('fxLabel', () => {
    it('is set for budgets entered in another currency', () => {
      const [section] = build(
        [],
        [budget({ id: 1, originalAmount: 99.5, originalCurrency: 'USD', exchangeRate: 25_000 })],
        'VND',
      );
      expect(section?.entries[0]?.fxLabel).toBe('~99.50 USD');
      expect(section?.entries[0]?.fx).toEqual({
        amount: 99.5,
        currency: expect.objectContaining({ code: 'USD' }),
      });
    });

    it('omits decimals for 0-dp original currencies', () => {
      const [section] = build(
        [],
        [budget({ id: 1, originalAmount: 1_500_000, originalCurrency: 'VND' })],
        'USD',
      );
      expect(section?.entries[0]?.fxLabel).toBe('~1,500,000 VND');
    });

    it('is absent when the original currency equals the home currency or is missing', () => {
      const [same] = build([], [budget({ id: 1, originalAmount: 5, originalCurrency: 'VND' })]);
      const [none] = build([], [budget({ id: 2 })]);
      expect(same?.entries[0]?.fxLabel).toBeUndefined();
      expect(none?.entries[0]?.fxLabel).toBeUndefined();
      expect(same?.entries[0]?.fx).toBeUndefined();
    });

    it('is never set on expenses (summary DTO lacks original fields)', () => {
      const [section] = build([expense({ id: 1 })], []);
      const entry: HistoryEntry | undefined = section?.entries[0];
      expect(entry?.fxLabel).toBeUndefined();
    });
  });
});
