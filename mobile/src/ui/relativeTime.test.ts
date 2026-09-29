import { formatRelativeUpdated } from './relativeTime';

const t = (key: string, options?: Record<string, unknown>) =>
  key.replace('{{0}}', String(options?.[0] ?? ''));

const NOW = Date.UTC(2026, 8, 13, 12, 0, 0);
const MIN = 60_000;

describe('formatRelativeUpdated', () => {
  it('says "just now" under a minute (and for future timestamps)', () => {
    expect(formatRelativeUpdated(NOW - 59_000, NOW, t)).toBe('just now');
    expect(formatRelativeUpdated(NOW + 5_000, NOW, t)).toBe('just now');
  });

  it('formats minutes, hours and days via Intl when available', () => {
    expect(formatRelativeUpdated(NOW - 5 * MIN, NOW, t)).toBe('5 minutes ago');
    expect(formatRelativeUpdated(NOW - 3 * 60 * MIN, NOW, t)).toBe('3 hours ago');
    expect(formatRelativeUpdated(NOW - 2 * 24 * 60 * MIN, NOW, t)).toBe('2 days ago');
  });

  it('floors partial units', () => {
    expect(formatRelativeUpdated(NOW - 119 * MIN, NOW, t)).toBe('1 hour ago');
  });

  it('honours the locale', () => {
    expect(formatRelativeUpdated(NOW - 5 * MIN, NOW, t, 'vi')).toBe('5 phút trước');
  });

  describe('without Intl.RelativeTimeFormat', () => {
    const original = Intl.RelativeTimeFormat;
    beforeAll(() => {
      Object.defineProperty(Intl, 'RelativeTimeFormat', { value: undefined, configurable: true });
    });
    afterAll(() => {
      Object.defineProperty(Intl, 'RelativeTimeFormat', { value: original, configurable: true });
    });

    it('falls back to the i18n keys', () => {
      expect(formatRelativeUpdated(NOW - 5 * MIN, NOW, t)).toBe('5 min ago');
      expect(formatRelativeUpdated(NOW - 3 * 60 * MIN, NOW, t)).toBe('3 hours ago');
      expect(formatRelativeUpdated(NOW - 2 * 24 * 60 * MIN, NOW, t)).toBe('2 days ago');
    });
  });
});
