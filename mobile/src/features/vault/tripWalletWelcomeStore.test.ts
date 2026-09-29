import {
  hasSeenTripWalletWelcome,
  markTripWalletWelcomeSeen,
  useTripWalletWelcomeStore,
} from './tripWalletWelcomeStore';

beforeEach(() => {
  useTripWalletWelcomeStore.setState({ seenUserIds: [] });
});

describe('hasSeenTripWalletWelcome', () => {
  it('is false for a user who has not seen it', () => {
    expect(hasSeenTripWalletWelcome('1')).toBe(false);
  });

  it('is true once markSeen is called for that user', () => {
    markTripWalletWelcomeSeen('1');
    expect(hasSeenTripWalletWelcome('1')).toBe(true);
  });

  it('does not affect a different user', () => {
    markTripWalletWelcomeSeen('1');
    expect(hasSeenTripWalletWelcome('2')).toBe(false);
  });

  it('treats null/undefined/empty userId as already seen (never blocks on an unresolved user)', () => {
    expect(hasSeenTripWalletWelcome(null)).toBe(true);
    expect(hasSeenTripWalletWelcome(undefined)).toBe(true);
    expect(hasSeenTripWalletWelcome('')).toBe(true);
  });

  it('markSeen is idempotent', () => {
    markTripWalletWelcomeSeen('1');
    markTripWalletWelcomeSeen('1');
    expect(useTripWalletWelcomeStore.getState().seenUserIds).toEqual(['1']);
  });

  it('markSeen no-ops for null/undefined/empty userId', () => {
    markTripWalletWelcomeSeen(null);
    markTripWalletWelcomeSeen(undefined);
    markTripWalletWelcomeSeen('');
    expect(useTripWalletWelcomeStore.getState().seenUserIds).toEqual([]);
  });
});
