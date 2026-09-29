import { getShareExtensionKey } from 'expo-share-intent';

import { useAuthStore } from '@/auth/authStore';
import { pendingLinkStore, usePendingLinkStore } from '@/links/pendingLinkStore';

// Lives outside `src/app/` on purpose: expo-router's typed-route generator treats
// every file under the app root as a route and refuses `+`-prefixed test files.
import { redirectSystemPath } from '@/app/+native-intent';

beforeEach(() => {
  usePendingLinkStore.getState().clear();
  useAuthStore.setState({ status: 'anon' });
});

describe('redirectSystemPath', () => {
  it('routes the share-extension hand-off to the app root on cold start', () => {
    expect(redirectSystemPath({ path: `/dataUrl=${getShareExtensionKey()}`, initial: true })).toBe(
      '/',
    );
  });

  it('routes the share-extension hand-off to the parked shell when warm', () => {
    expect(redirectSystemPath({ path: `/dataUrl=${getShareExtensionKey()}`, initial: false })).toBe(
      '/_parked',
    );
  });

  it('authed tripInvite → routes straight to /join/[code], nothing parked', () => {
    useAuthStore.setState({ status: 'authed' });
    expect(redirectSystemPath({ path: '/join/ABC123', initial: true })).toBe('/join/ABC123');
    expect(pendingLinkStore.peek()).toBeNull();
  });

  it('anon tripInvite, cold start → parks the link and lands on /', () => {
    useAuthStore.setState({ status: 'anon' });
    expect(redirectSystemPath({ path: '/join/ABC123', initial: true })).toBe('/');
    expect(pendingLinkStore.peek()).toEqual({ kind: 'tripInvite', inviteCode: 'ABC123' });
  });

  it('anon tripInvite, warm start → parks the link and lands on /_parked', () => {
    useAuthStore.setState({ status: 'anon' });
    expect(redirectSystemPath({ path: '/join/ABC123', initial: false })).toBe('/_parked');
    expect(pendingLinkStore.peek()).toEqual({ kind: 'tripInvite', inviteCode: 'ABC123' });
  });

  it('expired (not authed) tripInvite → parks the link, does not navigate directly', () => {
    useAuthStore.setState({ status: 'expired' });
    expect(redirectSystemPath({ path: '/join/ABC123', initial: true })).toBe('/');
    expect(pendingLinkStore.peek()).toEqual({ kind: 'tripInvite', inviteCode: 'ABC123' });
  });

  it('parks a non-navigable link and lands on / when cold', () => {
    expect(redirectSystemPath({ path: '/listing/12', initial: true })).toBe('/');
    expect(pendingLinkStore.peek()).toEqual({ kind: 'listing', listingId: 12 });
  });

  it('parks a non-navigable link and lands on /_parked when warm', () => {
    expect(redirectSystemPath({ path: '/listing/12', initial: false })).toBe('/_parked');
    expect(pendingLinkStore.peek()).toEqual({ kind: 'listing', listingId: 12 });
  });

  it('swallows a malformed link on a known path instead of 404-ing (cold → /, warm → /_parked)', () => {
    expect(redirectSystemPath({ path: 'oneplan://listing/0', initial: true })).toBe('/');
    expect(redirectSystemPath({ path: '/listing/abc', initial: false })).toBe('/_parked');
    expect(redirectSystemPath({ path: 'oneplan://join/', initial: false })).toBe('/_parked');
    expect(pendingLinkStore.peek()).toBeNull();
  });

  it('returns an unrecognized path unchanged and parks nothing', () => {
    expect(redirectSystemPath({ path: '/some/random/path', initial: true })).toBe(
      '/some/random/path',
    );
    expect(pendingLinkStore.peek()).toBeNull();
  });
});
