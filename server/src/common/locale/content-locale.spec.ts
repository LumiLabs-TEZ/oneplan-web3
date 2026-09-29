import { parseAcceptLanguage } from './content-locale';

describe('parseAcceptLanguage', () => {
  it('picks the first supported tag in header order', () => {
    expect(parseAcceptLanguage('vi-VN,vi;q=0.9,en;q=0.8')).toBe('vi');
    expect(parseAcceptLanguage('en-US,en;q=0.9')).toBe('en');
  });

  it('skips unsupported tags and falls through to a supported one', () => {
    expect(parseAcceptLanguage('ja-JP, en;q=0.5')).toBe('en');
  });

  it('returns null for unsupported-only, wildcard, empty or missing headers', () => {
    expect(parseAcceptLanguage('ja')).toBeNull();
    expect(parseAcceptLanguage('*')).toBeNull();
    expect(parseAcceptLanguage('')).toBeNull();
    expect(parseAcceptLanguage(undefined)).toBeNull();
    expect(parseAcceptLanguage(null)).toBeNull();
  });

  it('accepts array-valued headers and is case-insensitive', () => {
    expect(parseAcceptLanguage(['VI-vn'])).toBe('vi');
  });
});
