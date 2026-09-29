import type { components } from '@/api/schema';

import { createTripStore, useCreateTripStore } from './createTripStore';

type LocationSearchResultDto = components['schemas']['LocationSearchResultDto'];

const hanoi: LocationSearchResultDto = {
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

const defaults = {
  name: '',
  location: null,
  range: { start: null, end: null },
  hasSelectedDuration: false,
  coverUri: null,
  selectedFriendIds: [],
};

beforeEach(() => {
  createTripStore.reset();
});

describe('createTripStore', () => {
  it('starts with the default draft', () => {
    const state = useCreateTripStore.getState();
    expect(state.name).toBe(defaults.name);
    expect(state.location).toBe(defaults.location);
    expect(state.range).toEqual(defaults.range);
    expect(state.hasSelectedDuration).toBe(defaults.hasSelectedDuration);
    expect(state.coverUri).toBe(defaults.coverUri);
  });

  it('setName / setLocation / setRange / setCoverUri update the draft', () => {
    createTripStore.setName('Da Lat trip');
    createTripStore.setLocation(hanoi);
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 0, 5);
    createTripStore.setRange({ start, end });
    createTripStore.setCoverUri('file:///cover.jpg');

    const state = useCreateTripStore.getState();
    expect(state.name).toBe('Da Lat trip');
    expect(state.location).toEqual(hanoi);
    expect(state.range).toEqual({ start, end });
    expect(state.coverUri).toBe('file:///cover.jpg');
  });

  it('reset returns every field to the default draft', () => {
    createTripStore.setName('Da Lat trip');
    createTripStore.setLocation(hanoi);
    createTripStore.setRange({ start: new Date(2026, 0, 1), end: null });
    createTripStore.setCoverUri('file:///cover.jpg');
    createTripStore.addFriend(7);

    createTripStore.reset();

    expect(useCreateTripStore.getState()).toMatchObject(defaults);
  });

  it('addFriend appends once per user id', () => {
    createTripStore.addFriend(7);
    createTripStore.addFriend(9);
    createTripStore.addFriend(7);

    expect(useCreateTripStore.getState().selectedFriendIds).toEqual([7, 9]);
  });
});
