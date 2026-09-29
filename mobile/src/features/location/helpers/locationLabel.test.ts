import type { components } from '@/api/schema';

import {
  locationSelectionText,
  locationSubtitle,
  locationTitle,
  toTripLocationIds,
} from './locationLabel';

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

describe('locationTitle', () => {
  it('uses the city name when present', () => {
    expect(locationTitle(cityResult)).toBe('Hanoi');
  });

  it('falls back to the state name when there is no city', () => {
    expect(locationTitle(stateOnlyResult)).toBe('Bali');
  });
});

describe('locationSubtitle', () => {
  it('joins state and country when a city is present', () => {
    expect(locationSubtitle(cityResult)).toBe('Hanoi, Vietnam');
  });

  it('is just the country name when there is no city', () => {
    expect(locationSubtitle(stateOnlyResult)).toBe('Indonesia');
  });
});

describe('locationSelectionText', () => {
  it('combines title and subtitle', () => {
    expect(locationSelectionText(cityResult)).toBe('Hanoi, Hanoi, Vietnam');
  });

  it('combines title and subtitle for a state-only result', () => {
    expect(locationSelectionText(stateOnlyResult)).toBe('Bali, Indonesia');
  });
});

describe('toTripLocationIds', () => {
  it('includes cityId when a city is present', () => {
    expect(toTripLocationIds(cityResult)).toEqual({ cityId: 1, stateId: 10, countryId: 100 });
  });

  it('omits cityId when there is no city', () => {
    expect(toTripLocationIds(stateOnlyResult)).toEqual({ stateId: 20, countryId: 200 });
  });
});
