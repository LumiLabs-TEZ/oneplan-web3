import type { components } from '@/api/schema';
import { CURRENCIES } from '@/lib/currency';

import {
  canSubmit,
  detailsFormReducer,
  initialDetailsForm,
  isMemberSelected,
  shareMemberIds,
  toCreateBody,
  toggleMember,
} from './detailsFormReducer';

type TripMemberDto = components['schemas']['TripMemberDto'];

const member = (userId: number, inviteStatus: TripMemberDto['inviteStatus'] = 'ACCEPTED') =>
  ({
    id: userId * 10,
    userId,
    displayName: `U${userId}`,
    avatarUrl: null,
    friendCode: null,
    inviteStatus,
    joinedAt: null,
    isPro: false,
  }) as TripMemberDto;

const members = [member(1), member(2), member(3), member(4, 'PENDING')];
const accepted = [1, 2, 3];

describe('toggleMember', () => {
  it('first tap from All selects only that member', () => {
    expect(toggleMember({ type: 'all' }, 2)).toEqual({ type: 'members', ids: [2] });
  });
  it('adds and removes members; removing the last falls back to All', () => {
    const two = toggleMember({ type: 'members', ids: [2] }, 3);
    expect(two).toEqual({ type: 'members', ids: [2, 3] });
    expect(toggleMember(two, 2)).toEqual({ type: 'members', ids: [3] });
    expect(toggleMember({ type: 'members', ids: [3] }, 3)).toEqual({ type: 'all' });
  });
});

describe('detailsFormReducer / canSubmit', () => {
  it('requires a non-blank name and a non-empty split', () => {
    const s0 = initialDetailsForm();
    expect(canSubmit(s0, accepted)).toBe(false);
    const s1 = detailsFormReducer(s0, { type: 'setName', name: '   ' });
    expect(canSubmit(s1, accepted)).toBe(false);
    const s2 = detailsFormReducer(s1, { type: 'setName', name: 'Lunch' });
    expect(canSubmit(s2, accepted)).toBe(true);
    expect(canSubmit(s2, [])).toBe(false);
  });
  it('resolves share ids from All and from an explicit selection (accepted only)', () => {
    expect(shareMemberIds({ type: 'all' }, accepted)).toEqual([1, 2, 3]);
    expect(shareMemberIds({ type: 'members', ids: [3, 4, 1] }, accepted)).toEqual([1, 3]);
    expect(isMemberSelected({ type: 'all' }, 9)).toBe(false);
    expect(isMemberSelected({ type: 'members', ids: [1] }, 1)).toBe(true);
    expect(isMemberSelected({ type: 'members', ids: [1] }, 2)).toBe(false);
  });
});

describe('toCreateBody', () => {
  const now = new Date('2026-09-13T10:00:00.000Z');
  const base = {
    members,
    amount: 120000,
    enteredCurrency: CURRENCIES.VND,
    homeCurrency: CURRENCIES.VND,
    displayCurrencies: [CURRENCIES.VND],
    now,
    fallbackName: 'Expense',
  };

  it('maps group payer, All split, and falls back to the localized name', () => {
    const body = toCreateBody({ ...base, form: initialDetailsForm({ category: 'COFFEE' }) });
    expect(body).toEqual({
      name: 'Expense',
      amount: 120000,
      category: 'COFFEE',
      memberIds: [1, 2, 3],
      expenseDate: '2026-09-13T10:00:00.000Z',
      paidByGroup: true,
    });
  });

  it('maps a member payer and an explicit split', () => {
    const form = initialDetailsForm({
      name: ' Dinner ',
      shareMode: { type: 'members', ids: [2] },
      paidBy: { type: 'member', userId: 1 },
    });
    const body = toCreateBody({ ...base, form });
    expect(body.name).toBe('Dinner');
    expect(body.paidById).toBe(1);
    expect(body.paidByGroup).toBeUndefined();
    expect(body.memberIds).toEqual([2]);
    expect(body.originalAmount).toBeUndefined();
  });

  it('sends the original pair only when entered in a non-home display currency', () => {
    const form = initialDetailsForm({ name: 'Taxi' });
    const body = toCreateBody({
      ...base,
      form,
      amount: 12.5,
      enteredCurrency: CURRENCIES.USD,
      displayCurrencies: [CURRENCIES.VND, CURRENCIES.USD],
    });
    expect(body.originalAmount).toBe(12.5);
    expect(body.originalCurrency).toBe('USD');
    // Single display currency → never an original pair, even if entered differs.
    const single = toCreateBody({ ...base, form, enteredCurrency: CURRENCIES.USD });
    expect(single.originalCurrency).toBeUndefined();
  });
});
