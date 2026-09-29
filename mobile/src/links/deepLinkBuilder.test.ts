import { customSchemeJoin, friendUrl, listingUrl, tripUrl, universalBase } from './deepLinkBuilder';

describe('universalBase', () => {
  it('prod → op.oneplan.space', () => {
    expect(universalBase('prod')).toBe('https://op.oneplan.space');
  });

  it('dev / local → dev-op.oneplan.space', () => {
    expect(universalBase('dev')).toBe('https://dev-op.oneplan.space');
    expect(universalBase('local')).toBe('https://dev-op.oneplan.space');
  });
});

describe('tripUrl / friendUrl / listingUrl', () => {
  it('build universal links under the variant base', () => {
    expect(tripUrl('ABC123', 'prod')).toBe('https://op.oneplan.space/join/ABC123');
    expect(friendUrl('ABC123', 'prod')).toBe('https://op.oneplan.space/friend/ABC123');
    expect(listingUrl(12, 'prod')).toBe('https://op.oneplan.space/listing/12');
    expect(tripUrl('ABC123', 'dev')).toBe('https://dev-op.oneplan.space/join/ABC123');
  });

  it('percent-encodes the code', () => {
    expect(tripUrl('AB C-1', 'prod')).toBe('https://op.oneplan.space/join/AB%20C-1');
  });
});

describe('customSchemeJoin', () => {
  it('builds the oneplan:// scheme URL', () => {
    expect(customSchemeJoin('ABC123')).toBe('oneplan://join/ABC123');
  });

  it('percent-encodes the code', () => {
    expect(customSchemeJoin('AB C')).toBe('oneplan://join/AB%20C');
  });
});
