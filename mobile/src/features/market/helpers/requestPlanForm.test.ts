import type { components } from '@/api/schema';

import { DEFAULT_REQUEST_PLAN_FORM, formatBudget, toCreateTripRequest } from './requestPlanForm';

const hanoi = {
  city: { id: 7, name: 'Hanoi' },
  state: { id: 3, name: 'Hà Nội' },
  country: { id: 1, name: 'Vietnam', emoji: '🇻🇳' },
} as components['schemas']['LocationSearchResultDto'];

describe('formatBudget', () => {
  it('groups digits', () => {
    expect(formatBudget('2500000')).toBe('2,500,000');
  });

  it('drops non-digits and regroups', () => {
    expect(formatBudget('-2,5a00')).toBe('2,500');
  });

  it('keeps empty input empty', () => {
    expect(formatBudget('')).toBe('');
    expect(formatBudget('abc')).toBe('');
  });
});

describe('toCreateTripRequest', () => {
  it('returns null without a destination', () => {
    expect(toCreateTripRequest(DEFAULT_REQUEST_PLAN_FORM)).toBeNull();
  });

  it('sends digits-only budget and trimmed description', () => {
    expect(
      toCreateTripRequest({
        ...DEFAULT_REQUEST_PLAN_FORM,
        destination: hanoi,
        budgetText: '2,500,000',
        description: '  street food  ',
      }),
    ).toEqual({
      countryId: 1,
      stateId: 3,
      cityId: 7,
      tag: 'FRIENDS',
      currency: 'VND',
      participantCount: 2,
      dayCount: 3,
      budget: 2500000,
      description: 'street food',
    });
  });

  it('omits empty budget, blank description and a missing city', () => {
    const body = toCreateTripRequest({
      ...DEFAULT_REQUEST_PLAN_FORM,
      destination: { ...hanoi, city: null },
      description: '   ',
    });
    expect(body).not.toHaveProperty('budget');
    expect(body).not.toHaveProperty('description');
    expect(body).not.toHaveProperty('cityId');
  });
});
