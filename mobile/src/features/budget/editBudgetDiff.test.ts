import type { components } from '@/api/schema';

import { buildUpdateBudgetBody, isBudgetDirty, seedEditBudget } from './editBudgetDiff';

type BudgetDto = components['schemas']['BudgetDto'];
type TripDto = components['schemas']['TripDto'];
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
const acceptedIds = [1, 2, 3];

const trip = (overrides: Partial<TripDto> = {}): TripDto =>
  ({
    id: 1,
    name: 'Trip',
    status: 'ONGOING',
    createdById: 1,
    createdAt: '2026-09-10T12:00:00.000Z',
    currency: 'VND',
    localCurrencies: [],
    marketplaceListingId: null,
    userMarketplaceRating: null,
    members,
    ...overrides,
  }) as TripDto;

const payment = (userId: number, amount = 1_000_000, isPaid = false) => ({
  id: userId,
  userId,
  displayName: `U${userId}`,
  avatarUrl: null,
  amount,
  isPaid,
  paidAt: null,
});

const budget = (overrides: Partial<BudgetDto> = {}): BudgetDto =>
  ({
    id: 7,
    tripId: 1,
    name: 'Hotel',
    amount: 1_000_000,
    scope: 'GROUP',
    createdAt: '2026-09-10T12:00:00.000Z',
    payments: [payment(1), payment(2), payment(3)],
    ...overrides,
  }) as BudgetDto;

describe('seedEditBudget', () => {
  it('seeds home-currency whole amount text and an "all" contributor set', () => {
    const seed = seedEditBudget(budget(), trip(), acceptedIds);
    expect(seed.amountText).toBe('1,000,000');
    expect(seed.baseline.amount).toBe(1_000_000);
    expect(seed.currency.code).toBe('VND');
    expect(seed.contributors).toBe('all');
  });

  it('prefers the original currency/amount and detects a partial contributor set', () => {
    const seed = seedEditBudget(
      budget({
        originalAmount: 10.5,
        originalCurrency: 'USD',
        payments: [payment(2, 250_000)],
      }),
      trip({ localCurrencies: ['USD'] }),
      acceptedIds,
    );
    expect(seed.currency.code).toBe('USD');
    expect(seed.amountText).toBe('10.50');
    expect(seed.baseline.amount).toBe(10.5);
    expect(seed.contributors).toEqual({ ids: [2] });
  });
});

describe('isBudgetDirty / buildUpdateBudgetBody', () => {
  const home = trip();
  const base = () => seedEditBudget(budget(), home, acceptedIds);

  it('returns null when nothing changed', () => {
    const seed = base();
    expect(isBudgetDirty(seed, seed)).toBe(false);
    expect(buildUpdateBudgetBody(seed, seed, home)).toBeNull();
  });

  it('omits amount when only the name changed', () => {
    const seed = base();
    const draft = { ...seed, name: 'Hotel (updated)' };
    expect(isBudgetDirty(seed, draft)).toBe(true);
    const body = buildUpdateBudgetBody(seed, draft, home);
    expect(body).toEqual({ name: 'Hotel (updated)' });
  });

  it('sends the changed amount when only the amount changed', () => {
    const seed = base();
    const draft = { ...seed, amountText: '2,000,000' };
    const body = buildUpdateBudgetBody(seed, draft, home);
    expect(body).toEqual({ name: 'Hotel', amount: 2_000_000 });
  });

  it('sends userIds only when the contributor selection changed', () => {
    const seed = base();
    const draft = { ...seed, contributors: { ids: [1, 2] } };
    const body = buildUpdateBudgetBody(seed, draft, home);
    expect(body).toEqual({ name: 'Hotel', userIds: [1, 2] });
  });
});
