import { storage } from '@/offline/mmkv';

import { pendingLinkStore, usePendingLinkStore } from './pendingLinkStore';

beforeEach(() => {
  usePendingLinkStore.getState().clear();
});

describe('pendingLinkStore', () => {
  it('starts empty', () => {
    expect(pendingLinkStore.peek()).toBeNull();
    expect(pendingLinkStore.consume()).toBeNull();
  });

  it('set → consume round-trips once', () => {
    pendingLinkStore.set({ kind: 'trip', tripId: 3, refreshPlan: true });
    expect(pendingLinkStore.peek()).toEqual({ kind: 'trip', tripId: 3, refreshPlan: true });
    expect(pendingLinkStore.consume()).toEqual({ kind: 'trip', tripId: 3, refreshPlan: true });
    expect(pendingLinkStore.consume()).toBeNull();
  });

  it('ignores a re-park of the link just consumed (native-intent + Linking double delivery)', () => {
    jest.useFakeTimers();
    pendingLinkStore.set({ kind: 'listing', listingId: 2 });
    expect(pendingLinkStore.consume()).toEqual({ kind: 'listing', listingId: 2 });
    pendingLinkStore.set({ kind: 'listing', listingId: 2 });
    expect(pendingLinkStore.peek()).toBeNull();
    // a different link still parks, and the same link parks again once the window has passed
    pendingLinkStore.set({ kind: 'listing', listingId: 3 });
    expect(pendingLinkStore.peek()).toEqual({ kind: 'listing', listingId: 3 });
    pendingLinkStore.consume();
    jest.advanceTimersByTime(2500);
    pendingLinkStore.set({ kind: 'listing', listingId: 3 });
    expect(pendingLinkStore.peek()).toEqual({ kind: 'listing', listingId: 3 });
    jest.useRealTimers();
  });

  it('last write wins', () => {
    pendingLinkStore.set({ kind: 'market' });
    pendingLinkStore.set({ kind: 'listing', listingId: 1 });
    expect(pendingLinkStore.consume()).toEqual({ kind: 'listing', listingId: 1 });
  });

  it('persists to MMKV under oneplan.pendingLink', () => {
    pendingLinkStore.set({ kind: 'tripInvite', inviteCode: 'ABC' });
    const raw = storage.getString('oneplan.pendingLink');
    expect(raw).toBeDefined();
    expect(JSON.parse(raw!).state.pending).toEqual({ kind: 'tripInvite', inviteCode: 'ABC' });
    pendingLinkStore.consume();
    expect(JSON.parse(storage.getString('oneplan.pendingLink')!).state.pending).toBeNull();
  });
});
