import { renderHook } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import { getShareExtensionKey } from 'expo-share-intent';

import { useAuthStore } from '@/auth/authStore';

import { pendingLinkStore, usePendingLinkStore } from './pendingLinkStore';
import { useUrlListener } from './useUrlListener';

const getInitialURL = Linking.getInitialURL as jest.Mock;
const addEventListener = Linking.addEventListener as jest.Mock;

let urlListener: ((event: { url: string }) => void) | null = null;
const remove = jest.fn();

beforeEach(() => {
  usePendingLinkStore.getState().clear();
  useAuthStore.setState({ status: 'anon' });
  urlListener = null;
  remove.mockClear();
  getInitialURL.mockReset().mockResolvedValue(null);
  addEventListener.mockReset().mockImplementation((_type: string, fn: typeof urlListener) => {
    urlListener = fn;
    return { remove };
  });
});

describe('useUrlListener', () => {
  it('parks a recognized link from the initial URL', async () => {
    getInitialURL.mockResolvedValue('oneplan://join/ABC123');
    const { unmount } = await renderHook(() => useUrlListener());
    expect(pendingLinkStore.peek()).toEqual({ kind: 'tripInvite', inviteCode: 'ABC123' });
    await unmount();
  });

  it('ignores an unrecognized initial URL', async () => {
    getInitialURL.mockResolvedValue('com.googleusercontent.apps.1:/oauth2redirect');
    await renderHook(() => useUrlListener());
    expect(pendingLinkStore.peek()).toBeNull();
  });

  it('parks a link from a live `url` event', async () => {
    await renderHook(() => useUrlListener());
    expect(urlListener).not.toBeNull();
    urlListener!({ url: 'oneplan://listing/12' });
    expect(pendingLinkStore.peek()).toEqual({ kind: 'listing', listingId: 12 });
  });

  it('ignores the share-extension hand-off URL', async () => {
    await renderHook(() => useUrlListener());
    urlListener!({ url: `oneplan://dataUrl=${getShareExtensionKey()}` });
    expect(pendingLinkStore.peek()).toBeNull();
  });

  it('dedupes the same URL fired twice within the window', async () => {
    await renderHook(() => useUrlListener());
    urlListener!({ url: 'oneplan://join/ABC123' });
    pendingLinkStore.clear();
    urlListener!({ url: 'oneplan://join/ABC123' });
    expect(pendingLinkStore.peek()).toBeNull(); // second, deduped call never re-sets it
  });

  it('does not dedupe a different URL', async () => {
    await renderHook(() => useUrlListener());
    urlListener!({ url: 'oneplan://join/ABC123' });
    urlListener!({ url: 'oneplan://join/XYZ999' });
    expect(pendingLinkStore.peek()).toEqual({ kind: 'tripInvite', inviteCode: 'XYZ999' });
  });

  it('does not park a tripInvite when already authed (+native-intent navigated)', async () => {
    useAuthStore.setState({ status: 'authed' });
    await renderHook(() => useUrlListener());
    urlListener!({ url: 'oneplan://join/ABC123' });
    expect(pendingLinkStore.peek()).toBeNull();
  });

  it('parks a tripInvite when not authed', async () => {
    useAuthStore.setState({ status: 'anon' });
    await renderHook(() => useUrlListener());
    urlListener!({ url: 'oneplan://join/ABC123' });
    expect(pendingLinkStore.peek()).toEqual({ kind: 'tripInvite', inviteCode: 'ABC123' });
  });

  it('still parks non-invite links when authed', async () => {
    useAuthStore.setState({ status: 'authed' });
    await renderHook(() => useUrlListener());
    urlListener!({ url: 'oneplan://listing/12' });
    expect(pendingLinkStore.peek()).toEqual({ kind: 'listing', listingId: 12 });
  });

  it('unsubscribes on unmount', async () => {
    const { unmount } = await renderHook(() => useUrlListener());
    await unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
