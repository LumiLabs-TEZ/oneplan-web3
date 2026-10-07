import type { components } from '@/api/schema';
import { FREE_PLANNING_TRIP_LIMIT } from '@/features/shell/quickActions';

import { buildCreateTripBody, canCreatePlanningTrip } from './createTripGate';

type LocationSearchResultDto = components['schemas']['LocationSearchResultDto'];

const cityResult: LocationSearchResultDto = {
  city: { id: 1, name: 'Hanoi', latitude: '21.03', longitude: '105.85' },
  state: { id: 10, name: 'Hanoi', iso2: 'HN', type: 'city', latitude: null, longitude: null },
  country: {
    id: 100,
    name: 'Vietnam',
    iso2: 'VN',
    iso3: 'VNM',
    phoneCode: '84',
    capital: 'Hanoi',
    currency: 'VND',
    region: 'Asia',
    subRegion: 'South-Eastern Asia',
    emoji: '🇻🇳',
  },
};

const stateOnlyResult: LocationSearchResultDto = {
  city: null,
  state: { id: 20, name: 'Bali', iso2: 'BA', type: 'province', latitude: null, longitude: null },
  country: {
    id: 200,
    name: 'Indonesia',
    iso2: 'ID',
    iso3: 'IDN',
    phoneCode: '62',
    capital: 'Jakarta',
    currency: 'IDR',
    region: 'Asia',
    subRegion: 'South-Eastern Asia',
    emoji: null,
  },
};

describe('canCreatePlanningTrip', () => {
  it('allows Pro users regardless of count', () => {
    expect(canCreatePlanningTrip(true, 999)).toBe(true);
  });

  it('allows free users under the cap', () => {
    expect(canCreatePlanningTrip(false, FREE_PLANNING_TRIP_LIMIT - 1)).toBe(true);
  });

  it('blocks free users at or over the cap', () => {
    expect(canCreatePlanningTrip(false, FREE_PLANNING_TRIP_LIMIT)).toBe(false);
    expect(canCreatePlanningTrip(false, FREE_PLANNING_TRIP_LIMIT + 1)).toBe(false);
  });
});

describe('buildCreateTripBody', () => {
  const baseRange = { start: null, end: null };

  it('is null when the trimmed name is empty', () => {
    expect(
      buildCreateTripBody({
        name: '   ',
        location: cityResult,
        range: baseRange,
        hasSelectedDuration: false,
      }),
    ).toBeNull();
  });

  it('is null without a location', () => {
    expect(
      buildCreateTripBody({
        name: 'Da Lat Trip',
        location: null,
        range: baseRange,
        hasSelectedDuration: false,
      }),
    ).toBeNull();
  });

  it('omits dates unless hasSelectedDuration is true', () => {
    const body = buildCreateTripBody({
      name: 'Da Lat Trip',
      location: cityResult,
      range: { start: new Date(2026, 0, 9), end: new Date(2026, 0, 11) },
      hasSelectedDuration: false,
    });
    expect(body).toEqual({ name: 'Da Lat Trip', cityId: 1, stateId: 10, countryId: 100 });
  });

  it('includes dates as yyyy-MM-dd when a duration is selected', () => {
    const body = buildCreateTripBody({
      name: 'Da Lat Trip',
      location: cityResult,
      range: { start: new Date(2026, 0, 9), end: new Date(2026, 0, 11) },
      hasSelectedDuration: true,
    });
    expect(body).toEqual({
      name: 'Da Lat Trip',
      cityId: 1,
      stateId: 10,
      countryId: 100,
      startDate: '2026-01-09',
      endDate: '2026-01-11',
    });
  });

  it('normalizes a reversed range and defaults end to start', () => {
    const singleDay = buildCreateTripBody({
      name: 'Trip',
      location: cityResult,
      range: { start: new Date(2026, 0, 15), end: null },
      hasSelectedDuration: true,
    });
    expect(singleDay?.startDate).toBe('2026-01-15');
    expect(singleDay?.endDate).toBe('2026-01-15');

    const reversed = buildCreateTripBody({
      name: 'Trip',
      location: cityResult,
      range: { start: new Date(2026, 0, 20), end: new Date(2026, 0, 18) },
      hasSelectedDuration: true,
    });
    expect(reversed?.startDate).toBe('2026-01-18');
    expect(reversed?.endDate).toBe('2026-01-20');
  });

  it('sends web3: true only when the group wallet is on', () => {
    const draft = {
      name: 'Trip',
      location: cityResult,
      range: baseRange,
      hasSelectedDuration: false,
    };
    expect(buildCreateTripBody({ ...draft, web3: true })?.web3).toBe(true);
    expect(buildCreateTripBody({ ...draft, web3: false })).not.toHaveProperty('web3');
    expect(buildCreateTripBody(draft)).not.toHaveProperty('web3');
  });

  it('uses ids from toTripLocationIds, omitting cityId for a state-only result', () => {
    const body = buildCreateTripBody({
      name: 'Bali Trip',
      location: stateOnlyResult,
      range: baseRange,
      hasSelectedDuration: false,
    });
    expect(body).toEqual({ name: 'Bali Trip', stateId: 20, countryId: 200 });
  });

  it('trims the name', () => {
    const body = buildCreateTripBody({
      name: '  Trimmed  ',
      location: cityResult,
      range: baseRange,
      hasSelectedDuration: false,
    });
    expect(body?.name).toBe('Trimmed');
  });
});
