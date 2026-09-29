import { shortenAddress } from './shortenAddress';

describe('shortenAddress', () => {
  it('keeps the first and last four characters of a long address', () => {
    expect(shortenAddress('9RqQabcdefghijklmnopDzQi')).toBe('9RqQ...DzQi');
  });

  it('returns a short string whole, up to the default 10-character limit', () => {
    expect(shortenAddress('short')).toBe('short');
    expect(shortenAddress('1234567890')).toBe('1234567890');
    expect(shortenAddress('12345678901')).toBe('1234...8901');
  });

  it('honours a custom limit (the deposit screens use 8)', () => {
    expect(shortenAddress('123456789', 8)).toBe('1234...6789');
    expect(shortenAddress('12345678', 8)).toBe('12345678');
  });
});
