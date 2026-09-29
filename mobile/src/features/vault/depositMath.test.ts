import {
  depositFeeMicro,
  depositNetMicro,
  formatMicroUsdc,
  grossDeposit,
  microUSDC,
} from './depositMath';

describe('microUSDC', () => {
  it('converts a whole number', () => {
    expect(microUSDC('12')).toBe(12_000_000n);
  });

  it('converts a decimal', () => {
    expect(microUSDC('12.34')).toBe(12_340_000n);
  });

  it('caps the fraction at 6 digits', () => {
    expect(microUSDC('1.1234567')).toBe(1_123_456n);
  });

  it('pads a short fraction', () => {
    expect(microUSDC('1.5')).toBe(1_500_000n);
  });

  it('is 0 for an empty string', () => {
    expect(microUSDC('')).toBe(0n);
  });

  it('handles a bare "0."', () => {
    expect(microUSDC('0.')).toBe(0n);
  });
});

describe('grossDeposit', () => {
  it('is 0 for a non-positive net', () => {
    expect(grossDeposit(0n)).toBe(0n);
    expect(grossDeposit(-1n)).toBe(0n);
  });

  it('grosses up so the net after the 0.1% skim is at least netMicro', () => {
    const net = 1_000_000n;
    const gross = grossDeposit(net);
    expect(depositNetMicro(gross)).toBeGreaterThanOrEqual(net);
  });
});

describe('depositFeeMicro / depositNetMicro', () => {
  it('fee is 0.1% of the amount', () => {
    expect(depositFeeMicro(1_000_000n)).toBe(1_000n);
  });

  it('net + fee equals the amount', () => {
    const amount = 4_990_000n;
    expect(depositNetMicro(amount) + depositFeeMicro(amount)).toBe(amount);
  });
});

describe('formatMicroUsdc', () => {
  it('trims a whole amount to no decimal', () => {
    expect(formatMicroUsdc(5_000_000n)).toBe('5');
  });

  it('trims trailing zeros in the fraction', () => {
    expect(formatMicroUsdc(4_990_000n)).toBe('4.99');
  });

  it('keeps all 6 fraction digits when none are trailing zeros', () => {
    expect(formatMicroUsdc(1_234_567n)).toBe('1.234567');
  });
});

// Cases carried over from the deleted `components/microUsdc.ts` duplicate (M5).
describe('microUSDC keypad-buffer edge cases', () => {
  it('returns 0 for an empty buffer', () => {
    expect(microUSDC('')).toBe(0n);
  });

  it('scales a whole number by 1e6', () => {
    expect(microUSDC('20')).toBe(20_000_000n);
  });

  it('pads a short fraction with trailing zeros', () => {
    expect(microUSDC('1.5')).toBe(1_500_000n);
  });

  it('keeps a full 6-digit fraction exactly', () => {
    expect(microUSDC('1.123456')).toBe(1_123_456n);
  });

  it('truncates (never rounds) a fraction longer than 6 digits', () => {
    expect(microUSDC('1.1234569')).toBe(1_123_456n);
  });

  it('handles a bare-dot buffer ("0.")', () => {
    expect(microUSDC('0.')).toBe(0n);
  });

  it('handles a fraction-only buffer (".5"-shaped "0.5")', () => {
    expect(microUSDC('0.5')).toBe(500_000n);
  });
});
