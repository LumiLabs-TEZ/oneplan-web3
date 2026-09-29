import type { TFunction } from 'i18next';

import { memberSinceLabel, memberSinceYear, ringText } from './memberSince';

/** Minimal `t` stand-in: renders the key with `{{0}}` substituted, like the en catalog does. */
const t = ((key: string, opts?: Record<string, unknown>) =>
  key === 'Member since %@' ? `Member since ${String(opts?.[0])}` : key) as unknown as TFunction;

describe('memberSinceYear', () => {
  it('reads the year from an ISO timestamp with fractional seconds', () => {
    expect(memberSinceYear('2025-03-09T10:11:12.345Z')).toBe(2025);
  });

  it('reads the year from a plain ISO timestamp', () => {
    // Mid-year so the assertion holds in every test-runner timezone (the year is read from the
    // parsed *local* date, matching how iOS formats the label with the device calendar).
    expect(memberSinceYear('2024-06-30T12:00:00Z')).toBe(2024);
  });

  it('reads the year from a date-only string', () => {
    expect(memberSinceYear('2023-06-01')).toBe(2023);
  });

  it('falls back to the 4-digit prefix when the value is not a date', () => {
    expect(memberSinceYear('2026 sometime')).toBe(2026);
  });

  it('returns null for null / unparseable input', () => {
    expect(memberSinceYear(null)).toBeNull();
    expect(memberSinceYear('')).toBeNull();
    expect(memberSinceYear('not-a-date')).toBeNull();
  });
});

describe('memberSinceLabel', () => {
  it('uses abbreviated month + year for a parseable date', () => {
    expect(memberSinceLabel('2025-03-09T10:11:12.345Z', 'en', t)).toBe('Member since Mar 2025');
  });

  it('falls back to the bare year when only a year is recoverable', () => {
    expect(memberSinceLabel('2026 sometime', 'en', t)).toBe('Member since 2026');
  });

  it('falls back to the bare key when nothing is recoverable', () => {
    expect(memberSinceLabel(null, 'en', t)).toBe('Member since');
    expect(memberSinceLabel('nope', 'en', t)).toBe('Member since');
  });

  it('formats the month in the app language', () => {
    const vi = memberSinceLabel('2025-03-09T00:00:00Z', 'vi', t);
    const expected = new Intl.DateTimeFormat('vi-VN', { month: 'short', year: 'numeric' }).format(
      new Date('2025-03-09T00:00:00Z'),
    );
    expect(vi).toBe(`Member since ${expected}`);
  });
});

describe('ringText', () => {
  it('uppercases the name and repeats the phrase twice', () => {
    expect(ringText('Bella Oi', 2025)).toBe(
      'BELLA OI - MEMBER SINCE 2025 - BELLA OI - MEMBER SINCE 2025 -',
    );
  });

  it('uses the real join year', () => {
    expect(ringText('Khang', 2024)).toBe('KHANG - MEMBER SINCE 2024 - KHANG - MEMBER SINCE 2024 -');
  });

  it('falls back to MEMBER for a blank name and drops the year when it is unknown', () => {
    expect(ringText('   ', null)).toBe('MEMBER - MEMBER - MEMBER - MEMBER -');
  });
});
