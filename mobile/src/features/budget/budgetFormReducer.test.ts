import type { components } from '@/api/schema';
import { CURRENCIES } from '@/lib/currency';

import {
  canSubmitBudget,
  contributorIdsToSave,
  initialBudgetForm,
  projectedBalance,
  toCreateBudgetBody,
  toggleContributor,
} from './budgetFormReducer';

type TripDto = components['schemas']['TripDto'];

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
    members: [],
    ...overrides,
  }) as TripDto;

describe('toggleContributor', () => {
  it('turns off "all" and selects only the tapped member', () => {
    const state = initialBudgetForm();
    expect(toggleContributor(state, 2).contributors).toEqual({ ids: [2] });
  });

  it('adds another id to an existing selection', () => {
    const state = initialBudgetForm({ contributors: { ids: [2] } });
    expect(toggleContributor(state, 3).contributors).toEqual({ ids: [2, 3] });
  });

  it('falls back to "all" when the last selected id is deselected', () => {
    const state = initialBudgetForm({ contributors: { ids: [2] } });
    expect(toggleContributor(state, 2).contributors).toBe('all');
  });
});

describe('contributorIdsToSave', () => {
  it('resolves "all" to the accepted ids, in accepted order', () => {
    const state = initialBudgetForm();
    expect(contributorIdsToSave(state, [3, 1, 2])).toEqual([3, 1, 2]);
  });

  it('preserves accepted order for an explicit selection regardless of toggle order', () => {
    const state = initialBudgetForm({ contributors: { ids: [2, 1] } });
    expect(contributorIdsToSave(state, [1, 2, 3])).toEqual([1, 2]);
  });
});

describe('projectedBalance', () => {
  it('adds perPerson × contributorCount to the current balance', () => {
    expect(projectedBalance(13_000, 1_000_000, 3)).toBe(3_013_000);
  });

  it('is unaffected when there are no contributors', () => {
    expect(projectedBalance(13_000, 1_000_000, 0)).toBe(13_000);
  });
});

describe('canSubmitBudget', () => {
  it('requires a non-empty name and at least one resolved contributor', () => {
    expect(canSubmitBudget(initialBudgetForm({ name: 'Hotel' }), [1, 2])).toBe(true);
    expect(canSubmitBudget(initialBudgetForm({ name: '  ' }), [1, 2])).toBe(false);
    expect(canSubmitBudget(initialBudgetForm({ name: 'Hotel' }), [])).toBe(false);
    expect(
      canSubmitBudget(initialBudgetForm({ name: 'Hotel', contributors: { ids: [9] } }), [1, 2]),
    ).toBe(false);
  });
});

describe('toCreateBudgetBody', () => {
  it('omits original fields for a single-currency trip', () => {
    const state = initialBudgetForm({ name: 'Hotel', contributors: 'all' });
    const body = toCreateBudgetBody(
      state,
      { amount: 500_000, currency: CURRENCIES.VND, trip: trip() },
      [1, 2],
    );
    expect(body).toEqual({
      name: 'Hotel',
      amount: 500_000,
      scope: 'GROUP',
      category: 'FOOD',
      userIds: [1, 2],
    });
  });

  it('always sends a default category (no picker in this port; iOS defaults to restaurant)', () => {
    const state = initialBudgetForm({ name: 'Hotel', contributors: 'all' });
    const body = toCreateBudgetBody(
      state,
      { amount: 500_000, currency: CURRENCIES.VND, trip: trip() },
      [1, 2],
    );
    expect(body.category).toBe('FOOD');
  });

  it('includes originalAmount/originalCurrency when entered in a non-home display currency', () => {
    const state = initialBudgetForm({ name: 'Hotel', contributors: 'all' });
    const body = toCreateBudgetBody(
      state,
      { amount: 24_500_000, currency: CURRENCIES.USD, trip: trip({ localCurrencies: ['USD'] }) },
      [1, 2],
    );
    expect(body.originalAmount).toBe(24_500_000);
    expect(body.originalCurrency).toBe('USD');
  });

  it('falls back to "Budget" when the name is blank', () => {
    const state = initialBudgetForm({ name: '   ' });
    const body = toCreateBudgetBody(
      state,
      { amount: 1, currency: CURRENCIES.VND, trip: trip() },
      [1],
    );
    expect(body.name).toBe('Budget');
  });
});
