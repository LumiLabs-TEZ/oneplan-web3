import { resolvePendingLink } from './useLinkResolver';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, usePathname: () => '/' }));

describe('resolvePendingLink', () => {
  it('no link → keep', () => {
    expect(resolvePendingLink(null, { ready: true, authed: true })).toEqual({ keep: true });
  });

  it('link with a screen, ready + authed → navigate', () => {
    expect(resolvePendingLink({ kind: 'trip', tripId: 4 }, { ready: true, authed: true })).toEqual({
      navigate: { pathname: '/trip/[tripId]', params: { tripId: '4' } },
    });
  });

  it('link with a screen but not ready → keep', () => {
    expect(resolvePendingLink({ kind: 'trip', tripId: 4 }, { ready: false, authed: true })).toEqual(
      { keep: true },
    );
  });

  it('link with a screen, authed, but the login route is still current → keep', () => {
    expect(
      resolvePendingLink(
        { kind: 'trip', tripId: 4 },
        { ready: true, authed: true, onAuthedRoute: false },
      ),
    ).toEqual({ keep: true });
  });

  it('link with a screen but not authed → keep', () => {
    expect(resolvePendingLink({ kind: 'trip', tripId: 4 }, { ready: true, authed: false })).toEqual(
      { keep: true },
    );
  });

  it('missions replays once ready and authenticated', () => {
    expect(resolvePendingLink({ kind: 'missions' }, { ready: true, authed: true })).toEqual({
      navigate: { pathname: '/missions', params: { source: 'push' } },
    });
  });

  // `/friend/[code]` landed with M3.4, so a parked friend invite now resolves.
  it('friendInvite link, ready + authed → navigate to /friend/[code]', () => {
    expect(
      resolvePendingLink(
        { kind: 'friendInvite', friendCode: 'ABC123' },
        { ready: true, authed: true },
      ),
    ).toEqual({ navigate: { pathname: '/friend/[code]', params: { code: 'ABC123' } } });
  });

  it('tripInvite link, ready + authed → navigate to /join/[code]', () => {
    expect(
      resolvePendingLink(
        { kind: 'tripInvite', inviteCode: 'ABC123' },
        { ready: true, authed: true },
      ),
    ).toEqual({
      navigate: { pathname: '/join/[code]', params: { code: 'ABC123' } },
    });
  });
});

it('defers listing links until authentication and replays public IDs', () => {
  const link = { kind: 'listing', listingId: 'AbC_123-xyz' } as const;
  expect(resolvePendingLink(link, { ready: false, authed: true })).toEqual({ keep: true });
  expect(resolvePendingLink(link, { ready: true, authed: false })).toEqual({ keep: true });
  expect(resolvePendingLink(link, { ready: true, authed: true })).toEqual({
    navigate: { pathname: '/market/listing/[id]', params: { id: 'AbC_123-xyz' } },
  });
});

it.each([
  { ready: false, authed: true },
  { ready: true, authed: false },
  { ready: true, authed: true, onAuthedRoute: false },
])('keeps Missions pending until navigation is ready: %j', (context) => {
  expect(resolvePendingLink({ kind: 'missions' }, context)).toEqual({ keep: true });
});
