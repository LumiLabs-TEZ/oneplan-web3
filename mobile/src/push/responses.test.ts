import type { PushOpen } from '@/links/link';

import { routeForPushOpen } from './responses';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { variant: 'dev', apiUrl: 'https://api.test', linkHosts: [] } } },
}));

const trip: PushOpen = { link: { kind: 'trip', tripId: 4 } };
const tripInvite: PushOpen = { link: { kind: 'tripInvite', inviteCode: 'ABC123' } };
const listing: PushOpen = { link: { kind: 'listing', listingId: 9 } };

describe('routeForPushOpen', () => {
  it('no link → nothing', () => {
    expect(routeForPushOpen({ link: null }, { ready: true, authed: true })).toEqual({});
    expect(
      routeForPushOpen(
        { link: null, engagementType: 'engagement_x' },
        { ready: true, authed: true },
      ),
    ).toEqual({});
  });

  it('trip link, ready + authed → navigate', () => {
    expect(routeForPushOpen(trip, { ready: true, authed: true })).toEqual({
      navigate: trip.link,
    });
  });

  it('trip link but not ready → store', () => {
    expect(routeForPushOpen(trip, { ready: false, authed: true })).toEqual({ store: trip.link });
  });

  it('trip link but not authed → store', () => {
    expect(routeForPushOpen(trip, { ready: true, authed: false })).toEqual({ store: trip.link });
  });

  it('listing link (screen since Phase 7), ready + authed → navigates', () => {
    expect(routeForPushOpen(listing, { ready: true, authed: true })).toEqual({
      navigate: listing.link,
    });
  });

  it('Missions push navigates after authentication', () => {
    const missions: PushOpen = { link: { kind: 'missions' } };
    expect(routeForPushOpen(missions, { ready: true, authed: true })).toEqual({
      navigate: missions.link,
    });
  });

  it('tripInvite link, ready + authed → navigates to /join/[code]', () => {
    expect(routeForPushOpen(tripInvite, { ready: true, authed: true })).toEqual({
      navigate: tripInvite.link,
    });
  });

  it('tripInvite link but not ready/authed → store', () => {
    expect(routeForPushOpen(tripInvite, { ready: false, authed: true })).toEqual({
      store: tripInvite.link,
    });
    expect(routeForPushOpen(tripInvite, { ready: true, authed: false })).toEqual({
      store: tripInvite.link,
    });
  });

  it('board link (has a tab screen), ready + authed → navigates', () => {
    expect(routeForPushOpen({ link: { kind: 'board' } }, { ready: true, authed: true })).toEqual({
      navigate: { kind: 'board' },
    });
  });
});
