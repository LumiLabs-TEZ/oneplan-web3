import { hrefForLink } from './href';

describe('hrefForLink', () => {
  it('trip', () => {
    expect(hrefForLink({ kind: 'trip', tripId: 4 })).toEqual({
      pathname: '/trip/[tripId]',
      params: { tripId: '4' },
    });
  });

  it('tripInvite', () => {
    expect(hrefForLink({ kind: 'tripInvite', inviteCode: 'ABC123' })).toEqual({
      pathname: '/join/[code]',
      params: { code: 'ABC123' },
    });
  });

  it('market', () => {
    expect(hrefForLink({ kind: 'market' })).toBe('/(tabs)/market');
  });

  it('board', () => {
    expect(hrefForLink({ kind: 'board' })).toBe('/(tabs)/board');
  });

  it('friendInvite', () => {
    expect(hrefForLink({ kind: 'friendInvite', friendCode: 'ABC123' })).toEqual({
      pathname: '/friend/[code]',
      params: { code: 'ABC123' },
    });
  });

  it('friendRequest lands on the friends list', () => {
    expect(hrefForLink({ kind: 'friendRequest' })).toBe('/profile/friends');
  });

  it('kinds with no screen yet → null', () => {
    expect(hrefForLink({ kind: 'listing', listingId: 3 })).toEqual({
      pathname: '/market/listing/[id]',
      params: { id: '3' },
    });
    expect(hrefForLink({ kind: 'pinExtraction', sessionId: 's1' })).toEqual({
      pathname: '/board/extract',
      params: { sessionId: 's1' },
    });
    expect(hrefForLink({ kind: 'pinExtractUrl', sourceUrl: 'https://vm.tiktok.com/abc/' })).toEqual(
      { pathname: '/board/extract', params: { sourceUrl: 'https://vm.tiktok.com/abc/' } },
    );
    expect(hrefForLink({ kind: 'missions' })).toEqual({
      pathname: '/missions',
      params: { source: 'push' },
    });
  });
});
