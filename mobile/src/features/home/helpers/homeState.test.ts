import { homeState, type HomeStateInput } from './homeState';

function input(overrides: Partial<HomeStateInput> = {}): HomeStateInput {
  return {
    fetchingTrips: false,
    hasOngoing: false,
    popularCount: 0,
    boardCount: 0,
    online: true,
    ...overrides,
  };
}

describe('homeState', () => {
  it('shows the loading branch while trips load with nothing else to render', () => {
    expect(homeState(input({ fetchingTrips: true }))).toBe('loading');
  });

  it('does not show loading when an ongoing trip is already available', () => {
    expect(homeState(input({ fetchingTrips: true, hasOngoing: true }))).toBe('content');
  });

  it('does not show loading when popular plans or boards are already available', () => {
    expect(homeState(input({ fetchingTrips: true, popularCount: 3 }))).toBe('content');
    expect(homeState(input({ fetchingTrips: true, boardCount: 1 }))).toBe('content');
  });

  it('shows the offline empty state when offline without an ongoing trip', () => {
    expect(homeState(input({ online: false }))).toBe('offline');
  });

  it('keeps content when offline but an ongoing trip is cached', () => {
    expect(homeState(input({ online: false, hasOngoing: true }))).toBe('content');
  });

  it('renders content when online with no trips at all (no empty state on Home)', () => {
    expect(homeState(input())).toBe('content');
  });
});
