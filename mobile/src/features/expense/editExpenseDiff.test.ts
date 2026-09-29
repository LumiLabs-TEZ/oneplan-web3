import type { components } from '@/api/schema';
import { CURRENCIES } from '@/lib/currency';

import { buildUpdateBody, isEditDirty, seedEditExpense } from './editExpenseDiff';

type ExpenseDto = components['schemas']['ExpenseDto'];
type TripMemberDto = components['schemas']['TripMemberDto'];

const member = (userId: number, inviteStatus: TripMemberDto['inviteStatus'] = 'ACCEPTED') =>
  ({
    id: userId,
    userId,
    displayName: `U${userId}`,
    avatarUrl: null,
    friendCode: null,
    inviteStatus,
    joinedAt: null,
    isPro: false,
  }) as TripMemberDto;
const members = [member(1), member(2), member(3)];

const expense = (overrides: Partial<ExpenseDto> = {}): ExpenseDto =>
  ({
    id: 77,
    tripId: 5,
    name: 'Dinner',
    amount: 250000,
    category: 'FOOD',
    note: 'with tip',
    receiptUrl: null,
    expenseDate: '2026-09-10T12:00:00.000Z',
    createdAt: '2026-09-10T12:00:00.000Z',
    paidBy: { userId: 1, displayName: 'U1', avatarUrl: null },
    shares: [1, 2, 3].map((userId) => ({
      id: userId,
      userId,
      displayName: `U${userId}`,
      avatarUrl: null,
      shareAmount: 250000 / 3,
      isSettled: false,
      settledAt: null,
    })),
    ...overrides,
  }) as ExpenseDto;

describe('seedEditExpense', () => {
  it('seeds home-currency amount text, member payer and All split', () => {
    const b = seedEditExpense(expense(), members, CURRENCIES.VND);
    expect(b.draft.amountText).toBe('250,000');
    expect(b.amount).toBe(250000);
    expect(b.currency.code).toBe('VND');
    expect(b.draft.paidBy).toEqual({ type: 'member', userId: 1 });
    expect(b.draft.shareMode).toEqual({ type: 'all' });
  });

  it('prefers the original currency/amount and detects a partial split + group payer', () => {
    const b = seedEditExpense(
      expense({
        originalAmount: 10.5,
        originalCurrency: 'USD',
        paidBy: null,
        shares: [
          {
            id: 2,
            userId: 2,
            displayName: 'U2',
            avatarUrl: null,
            shareAmount: 250000,
            isSettled: false,
            settledAt: null,
          },
        ],
      }),
      members,
      CURRENCIES.VND,
    );
    expect(b.currency.code).toBe('USD');
    expect(b.draft.amountText).toBe('10.50');
    expect(b.amount).toBe(10.5);
    expect(b.draft.paidBy).toEqual({ type: 'group' });
    expect(b.draft.shareMode).toEqual({ type: 'members', ids: [2] });
  });
});

describe('buildUpdateBody', () => {
  const home = CURRENCIES.VND;
  const base = () => seedEditExpense(expense(), members, home);

  it('returns null when nothing changed', () => {
    const b = base();
    expect(isEditDirty(b, b.draft)).toBe(false);
    expect(
      buildUpdateBody({
        baseline: b,
        draft: b.draft,
        members,
        homeCurrency: home,
        note: 'with tip',
      }),
    ).toBeNull();
  });

  it('rename-only sends no money/split/payer fields', () => {
    const b = base();
    const body = buildUpdateBody({
      baseline: b,
      draft: { ...b.draft, name: ' Late dinner ' },
      members,
      homeCurrency: home,
      note: 'with tip',
    });
    expect(body).toEqual({
      name: 'Late dinner',
      category: 'FOOD',
      expenseDate: '2026-09-10T12:00:00.000Z',
      note: 'with tip',
    });
  });

  it('amount change in home currency sends amount only', () => {
    const b = base();
    const body = buildUpdateBody({
      baseline: b,
      draft: { ...b.draft, amountText: '300,000' },
      members,
      homeCurrency: home,
      note: null,
    });
    expect(body?.amount).toBe(300000);
    expect(body?.originalAmount).toBeUndefined();
    expect(body?.note).toBeUndefined();
  });

  it('currency change sends the original pair', () => {
    const b = base();
    const body = buildUpdateBody({
      baseline: b,
      draft: { ...b.draft, amountText: '12.5', currency: CURRENCIES.USD },
      members,
      homeCurrency: home,
      note: null,
    });
    expect(body?.amount).toBe(12.5);
    expect(body?.originalAmount).toBe(12.5);
    expect(body?.originalCurrency).toBe('USD');
  });

  it('member change sends memberIds; payer change sends paidBy fields', () => {
    const b = base();
    const body = buildUpdateBody({
      baseline: b,
      draft: { ...b.draft, shareMode: { type: 'members', ids: [2] }, paidBy: { type: 'group' } },
      members,
      homeCurrency: home,
      note: null,
    });
    expect(body?.memberIds).toEqual([2]);
    expect(body?.paidByGroup).toBe(true);
    expect(body?.paidById).toBeUndefined();

    const toMember = buildUpdateBody({
      baseline: b,
      draft: { ...b.draft, paidBy: { type: 'member', userId: 3 } },
      members,
      homeCurrency: home,
      note: null,
    });
    expect(toMember?.paidById).toBe(3);
    expect(toMember?.paidByGroup).toBe(false);
    expect(toMember?.memberIds).toBeUndefined();
  });
});
