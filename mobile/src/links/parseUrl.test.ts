import { DEEP_LINK_CODE, parseUrlToLink } from './parseUrl';

const hosts = ['api.oneplan.space', 'dev-api.oneplan.space', 'op.oneplan.space'];

describe('DEEP_LINK_CODE', () => {
  it('accepts 6-64 char alphanumeric + dash/underscore', () => {
    expect(DEEP_LINK_CODE.test('ABC123')).toBe(true);
    expect(DEEP_LINK_CODE.test('a'.repeat(64))).toBe(true);
  });

  it('rejects too short, too long, or bad chars', () => {
    expect(DEEP_LINK_CODE.test('ABC12')).toBe(false); // 5
    expect(DEEP_LINK_CODE.test('a'.repeat(65))).toBe(false); // 65
    expect(DEEP_LINK_CODE.test('ABC 123')).toBe(false);
    expect(DEEP_LINK_CODE.test('ABC!123')).toBe(false);
  });
});

describe('parseUrlToLink — trip invite (join)', () => {
  it('custom scheme URL', () => {
    expect(parseUrlToLink('oneplan://join/ABC123', hosts)).toEqual({
      kind: 'tripInvite',
      inviteCode: 'ABC123',
    });
  });

  it('universal https URL', () => {
    expect(parseUrlToLink('https://op.oneplan.space/join/ABC123', hosts)).toEqual({
      kind: 'tripInvite',
      inviteCode: 'ABC123',
    });
  });

  it('bare path (expo-router redirectSystemPath form)', () => {
    expect(parseUrlToLink('/join/ABC123', hosts)).toEqual({
      kind: 'tripInvite',
      inviteCode: 'ABC123',
    });
  });

  it('uppercase "Join" segment is case-insensitive', () => {
    expect(parseUrlToLink('oneplan://Join/ABC123', hosts)).toEqual({
      kind: 'tripInvite',
      inviteCode: 'ABC123',
    });
    expect(parseUrlToLink('/JOIN/ABC123', hosts)).toEqual({
      kind: 'tripInvite',
      inviteCode: 'ABC123',
    });
  });

  it('decodes a percent-encoded code before validating', () => {
    expect(parseUrlToLink('oneplan://join/ABC%2D123', hosts)).toEqual({
      kind: 'tripInvite',
      inviteCode: 'ABC-123',
    });
  });

  it('code length 5 / 65 / bad char → null', () => {
    expect(parseUrlToLink('oneplan://join/ABC12', hosts)).toBeNull();
    expect(parseUrlToLink(`oneplan://join/${'a'.repeat(65)}`, hosts)).toBeNull();
    expect(parseUrlToLink('oneplan://join/ABC!123', hosts)).toBeNull();
  });

  it('missing code → null', () => {
    expect(parseUrlToLink('oneplan://join/', hosts)).toBeNull();
    expect(parseUrlToLink('oneplan://join', hosts)).toBeNull();
  });
});

describe('parseUrlToLink — friend invite', () => {
  it('custom scheme URL', () => {
    expect(parseUrlToLink('oneplan://friend/FRIEND01', hosts)).toEqual({
      kind: 'friendInvite',
      friendCode: 'FRIEND01',
    });
  });

  it('universal https URL', () => {
    expect(parseUrlToLink('https://dev-api.oneplan.space/friend/FRIEND01', hosts)).toEqual({
      kind: 'friendInvite',
      friendCode: 'FRIEND01',
    });
  });

  it('bare path', () => {
    expect(parseUrlToLink('/friend/FRIEND01', hosts)).toEqual({
      kind: 'friendInvite',
      friendCode: 'FRIEND01',
    });
  });
});

describe('parseUrlToLink — listing', () => {
  it('custom scheme and universal URL', () => {
    expect(parseUrlToLink('oneplan://listing/12', hosts)).toEqual({
      kind: 'listing',
      listingId: 12,
    });
    expect(parseUrlToLink('https://api.oneplan.space/listing/12', hosts)).toEqual({
      kind: 'listing',
      listingId: 12,
    });
    expect(parseUrlToLink('/listing/12', hosts)).toEqual({ kind: 'listing', listingId: 12 });
  });

  it('id 0 or non-numeric → null', () => {
    expect(parseUrlToLink('oneplan://listing/0', hosts)).toBeNull();
    expect(parseUrlToLink('oneplan://listing/abc', hosts)).toBeNull();
    expect(parseUrlToLink('oneplan://listing/-5', hosts)).toBeNull();
    expect(parseUrlToLink('oneplan://listing/', hosts)).toBeNull();
  });
});

describe('parseUrlToLink — board extract', () => {
  it('oneplan://board/extract → board', () => {
    expect(parseUrlToLink('oneplan://board/extract', hosts)).toEqual({ kind: 'board' });
  });

  it('other board paths → null', () => {
    expect(parseUrlToLink('oneplan://board/other', hosts)).toBeNull();
    expect(parseUrlToLink('oneplan://board', hosts)).toBeNull();
  });
});

describe('parseUrlToLink — rejections', () => {
  it('unknown https host → null', () => {
    expect(parseUrlToLink('https://evil.example.com/join/ABC123', hosts)).toBeNull();
  });

  it('Google reverse-client-id OAuth callback → null', () => {
    expect(
      parseUrlToLink(
        'com.googleusercontent.apps.123-abc:/oauth2redirect/google#access_token=x',
        hosts,
      ),
    ).toBeNull();
  });

  it('unrecognized path → null', () => {
    expect(parseUrlToLink('oneplan://unknown/ABC123', hosts)).toBeNull();
    expect(parseUrlToLink('/unknown/ABC123', hosts)).toBeNull();
  });

  it('empty / garbage input → null', () => {
    expect(parseUrlToLink('', hosts)).toBeNull();
    expect(parseUrlToLink('not a url', hosts)).toBeNull();
  });
});

it('accepts opaque marketplace public IDs without losing them', () => {
  expect(parseUrlToLink('oneplan://listing/AbC_123-xyz', [])).toEqual({
    kind: 'listing',
    listingId: 'AbC_123-xyz',
  });
  expect(parseUrlToLink('oneplan://listing/9007199254740993', [])).toBeNull();
  expect(parseUrlToLink('oneplan://listing/%2Fbad', [])).toBeNull();
});
