import { act, renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';

import { initI18n } from '@/i18n';
import { markSelfLeave, useRealtimeStore } from '@/realtime/realtimeStore';

import { isInEndFlow, tripRealtimeAction, useTripRealtimeEffects } from './useTripRealtimeEffects';

let mockPathname = '/trip/7';
jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), dismissTo: jest.fn() },
  usePathname: () => mockPathname,
}));

let mockWeb3Enabled = true;
jest.mock('@/features/vault/web3Flag', () => ({ useWeb3Enabled: () => mockWeb3Enabled }));

describe('tripRealtimeAction', () => {
  it('does nothing without a pending effect', () => {
    expect(
      tripRealtimeAction({ ended: false, deleted: false, removedMe: false, isCreator: false }),
    ).toBeNull();
  });

  it('opens the trip-end recap when the trip ended', () => {
    expect(
      tripRealtimeAction({ ended: true, deleted: false, removedMe: false, isCreator: false }),
    ).toBe('openEnd');
    expect(
      tripRealtimeAction({ ended: true, deleted: false, removedMe: false, isCreator: true }),
    ).toBe('openEnd');
  });

  it('announces a deletion only to members who are not the creator', () => {
    expect(
      tripRealtimeAction({ ended: false, deleted: true, removedMe: false, isCreator: false }),
    ).toBe('announceDeleted');
    expect(
      tripRealtimeAction({ ended: false, deleted: true, removedMe: false, isCreator: true }),
    ).toBeNull();
  });

  it('prefers the end recap when both arrive together', () => {
    expect(
      tripRealtimeAction({ ended: true, deleted: true, removedMe: false, isCreator: false }),
    ).toBe('openEnd');
  });

  it('leaves when the current user was the one removed', () => {
    expect(
      tripRealtimeAction({ ended: false, deleted: false, removedMe: true, isCreator: false }),
    ).toBe('leftByRemoval');
    // A creator can't remove themself, but the decision should still favour the removal.
    expect(
      tripRealtimeAction({ ended: false, deleted: false, removedMe: true, isCreator: true }),
    ).toBe('leftByRemoval');
  });

  it('prefers the end recap over a removal when both arrive together', () => {
    expect(
      tripRealtimeAction({ ended: true, deleted: false, removedMe: true, isCreator: false }),
    ).toBe('openEnd');
  });
});

describe('useTripRealtimeEffects — tripMemberRemoved (H3)', () => {
  const TRIP = 9;
  const ME = 4;

  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockWeb3Enabled = true;
    useRealtimeStore.getState().reset();
  });

  const removeMe = async () => {
    await act(async () => {
      useRealtimeStore
        .getState()
        .pushEffect({ type: 'tripMemberRemoved', tripId: TRIP, userId: ME });
    });
  };

  it('web3 on: being removed leaves the trip screen', async () => {
    await renderHook(() => useTripRealtimeEffects(TRIP, false, ME));
    await removeMe();
    expect(router.dismissTo).toHaveBeenCalledWith('/(tabs)/home');
  });

  it('web3 off: never navigates, and leaves the effect untouched', async () => {
    mockWeb3Enabled = false;
    await renderHook(() => useTripRealtimeEffects(TRIP, false, ME));
    await removeMe();
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(useRealtimeStore.getState().lastTripMemberRemoved).not.toBeNull();
  });

  it('a removal of someone else does not navigate', async () => {
    await renderHook(() => useTripRealtimeEffects(TRIP, false, ME));
    await act(async () => {
      useRealtimeStore
        .getState()
        .pushEffect({ type: 'tripMemberRemoved', tripId: TRIP, userId: 99 });
    });
    expect(router.dismissTo).not.toHaveBeenCalled();
  });

  it('does not double-navigate when I left through the classic sheet (which already replaced)', async () => {
    await renderHook(() => useTripRealtimeEffects(TRIP, false, ME));
    markSelfLeave(TRIP);
    await removeMe();
    expect(router.dismissTo).not.toHaveBeenCalled();
    // ...and the mark is one-shot: a later genuine removal still navigates.
    await removeMe();
    expect(router.dismissTo).toHaveBeenCalledTimes(1);
  });
});

describe('useTripRealtimeEffects — tripEnded', () => {
  const TRIP = 9;

  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    useRealtimeStore.getState().reset();
  });

  const endTrip = async () => {
    await act(async () => {
      useRealtimeStore.getState().pushEffect({ type: 'tripEnded', tripId: TRIP });
    });
  };

  it('opens the trip-end recap from the trip screen', async () => {
    mockPathname = `/trip/${TRIP}`;
    await renderHook(() => useTripRealtimeEffects(TRIP, false, 4));
    await endTrip();
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/trip/[tripId]/end',
      params: { tripId: String(TRIP), mode: 'flow' },
    });
  });

  it('leaves it to the end-trip screens when one is already showing', async () => {
    mockPathname = `/trip/${TRIP}/end-waiting`;
    await renderHook(() => useTripRealtimeEffects(TRIP, false, 4));
    await endTrip();
    expect(router.replace).not.toHaveBeenCalled();
    expect(useRealtimeStore.getState().lastTripEnded).toBeNull();
  });
});

describe('isInEndFlow', () => {
  it('matches the end, waiting and review screens only', () => {
    expect(isInEndFlow('/trip/9/end')).toBe(true);
    expect(isInEndFlow('/trip/9/end-waiting')).toBe(true);
    expect(isInEndFlow('/trip/9/end-review')).toBe(true);
    expect(isInEndFlow('/trip/9')).toBe(false);
    expect(isInEndFlow('/trip/9/end-denied')).toBe(false);
  });
});
