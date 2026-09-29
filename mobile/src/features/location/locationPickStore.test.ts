import { locationPickStore, useLocationPickStore } from './locationPickStore';
import type { LocationPick } from './types';

const pick: LocationPick = {
  name: 'Da Lat Market',
  latitude: 11.94,
  longitude: 108.44,
  address: '1 Market St',
  category: 'Market',
  source: 'search',
};

beforeEach(() => {
  useLocationPickStore.setState({ result: null });
});

describe('locationPickStore', () => {
  it('starts with a null result', () => {
    expect(useLocationPickStore.getState().result).toBeNull();
  });

  it('set() stores the pick', () => {
    locationPickStore.set(pick);
    expect(useLocationPickStore.getState().result).toEqual(pick);
  });

  it('consume() returns the stored pick and clears it', () => {
    locationPickStore.set(pick);

    const consumed = locationPickStore.consume();

    expect(consumed).toEqual(pick);
    expect(useLocationPickStore.getState().result).toBeNull();
  });

  it('consume() returns null when nothing was set, and is idempotent', () => {
    expect(locationPickStore.consume()).toBeNull();

    locationPickStore.set(pick);
    locationPickStore.consume();
    expect(locationPickStore.consume()).toBeNull();
  });
});
