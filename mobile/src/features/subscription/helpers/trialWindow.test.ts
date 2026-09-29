import { countdown, isWindowOpen, startWindowIfNeeded, TRIAL_WINDOW_MS } from './trialWindow';

const NOW = 1_000_000;

describe('startWindowIfNeeded', () => {
  it('starts a new window (now + windowMs) when no deadline exists', () => {
    expect(startWindowIfNeeded(null, NOW)).toBe(NOW + TRIAL_WINDOW_MS);
  });

  it('uses a custom windowMs when provided', () => {
    expect(startWindowIfNeeded(null, NOW, 60_000)).toBe(NOW + 60_000);
  });

  it('returns the existing deadline unchanged when one is already set', () => {
    const existing = NOW + 500;
    expect(startWindowIfNeeded(existing, NOW)).toBe(existing);
  });

  it('returns an existing PAST deadline unchanged too (never restarts the clock)', () => {
    const existing = NOW - 500;
    expect(startWindowIfNeeded(existing, NOW)).toBe(existing);
  });
});

describe('isWindowOpen', () => {
  it('is false when the deadline is null', () => {
    expect(isWindowOpen(null, NOW)).toBe(false);
  });

  it('is true while now is before the deadline', () => {
    expect(isWindowOpen(NOW + 1, NOW)).toBe(true);
  });

  it('is false once now has reached the deadline', () => {
    expect(isWindowOpen(NOW, NOW)).toBe(false);
  });

  it('is false once now is past the deadline', () => {
    expect(isWindowOpen(NOW - 1, NOW)).toBe(false);
  });
});

describe('countdown', () => {
  it('zero-floors when the deadline is null', () => {
    expect(countdown(null, NOW)).toEqual({ hrs: 0, min: 0, sec: 0 });
  });

  it('zero-floors once the deadline has passed', () => {
    expect(countdown(NOW - 5_000, NOW)).toEqual({ hrs: 0, min: 0, sec: 0 });
  });

  it('splits remaining ms into hrs/min/sec', () => {
    const remainingMs = 2 * 3_600_000 + 5 * 60_000 + 9_000;
    expect(countdown(NOW + remainingMs, NOW)).toEqual({ hrs: 2, min: 5, sec: 9 });
  });

  it('floors partial seconds', () => {
    expect(countdown(NOW + 1_999, NOW)).toEqual({ hrs: 0, min: 0, sec: 1 });
  });

  it('handles the full 1h window', () => {
    expect(countdown(NOW + TRIAL_WINDOW_MS, NOW)).toEqual({ hrs: 1, min: 0, sec: 0 });
  });
});
