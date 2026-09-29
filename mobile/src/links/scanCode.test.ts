import { parseScannedCode } from './scanCode';

const hosts = [
  'api.oneplan.space',
  'dev-api.oneplan.space',
  'op.oneplan.space',
  'dev-op.oneplan.space',
];

describe('parseScannedCode', () => {
  it('custom-scheme friend invite', () => {
    expect(parseScannedCode('oneplan://friend/ABC123', hosts)).toEqual({
      kind: 'friend',
      code: 'ABC123',
    });
  });

  it('custom-scheme trip invite (join)', () => {
    expect(parseScannedCode('oneplan://join/ABC123', hosts)).toEqual({
      kind: 'tripInvite',
      code: 'ABC123',
    });
  });

  it.each(hosts)('universal-link host %s resolves a join code', (host) => {
    expect(parseScannedCode(`https://${host}/join/ABC123`, hosts)).toEqual({
      kind: 'tripInvite',
      code: 'ABC123',
    });
  });

  it.each(hosts)('universal-link host %s resolves a friend code', (host) => {
    expect(parseScannedCode(`https://${host}/friend/XYZ789`, hosts)).toEqual({
      kind: 'friend',
      code: 'XYZ789',
    });
  });

  it('?invitecode= query param on an unrecognized host', () => {
    expect(parseScannedCode('https://example.com/x?invitecode=ABC123', hosts)).toEqual({
      kind: 'tripInvite',
      code: 'ABC123',
    });
  });

  it('?code= query param, case-insensitive key', () => {
    expect(parseScannedCode('https://example.com/x?CODE=ABC123', hosts)).toEqual({
      kind: 'tripInvite',
      code: 'ABC123',
    });
  });

  it('bare code matching DEEP_LINK_CODE', () => {
    expect(parseScannedCode('ABC123DEF', hosts)).toEqual({ kind: 'tripInvite', code: 'ABC123DEF' });
  });

  it('junk text returns null', () => {
    expect(parseScannedCode('not a code at all!!', hosts)).toBeNull();
  });

  it('whitespace-only returns null', () => {
    expect(parseScannedCode('   ', hosts)).toBeNull();
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(parseScannedCode('  ABC123DEF  ', hosts)).toEqual({
      kind: 'tripInvite',
      code: 'ABC123DEF',
    });
  });

  it('query param with an invalid code shape is ignored, falls through to null', () => {
    expect(parseScannedCode('https://example.com/x?invitecode=bad!', hosts)).toBeNull();
  });

  it('defaults hosts from env.linkHosts when omitted', () => {
    // Global jest mock sets linkHosts: [] — an unrecognized host without a query code is null.
    expect(parseScannedCode('https://op.oneplan.space/join/ABC123')).toBeNull();
  });
});
