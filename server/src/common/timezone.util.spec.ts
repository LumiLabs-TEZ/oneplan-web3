import {
  parseTimezone,
  isInNotificationWindow,
  localHourInTimezone,
  localDateInTimezone,
} from './timezone.util';

describe('timezone.util', () => {
  describe('parseTimezone', () => {
    it('should extract zoneName from valid timezone JSON', () => {
      const json = '[{"zoneName":"Asia/Ho_Chi_Minh","gmtOffset":25200}]';
      expect(parseTimezone(json)).toBe('Asia/Ho_Chi_Minh');
    });

    it('should return null for invalid JSON', () => {
      expect(parseTimezone('invalid')).toBeNull();
    });

    it('should return null for empty array', () => {
      expect(parseTimezone('[]')).toBeNull();
    });

    it('should return null for null input', () => {
      expect(parseTimezone(null)).toBeNull();
    });
  });

  describe('isInNotificationWindow', () => {
    // Notify if plan is within 45 minutes AND hasn't started yet. Vietnam = UTC+7.
    it('should return true for 45 minutes away (at boundary)', () => {
      const now = new Date('2026-04-13T02:00:00Z');
      const planDate = new Date('2026-04-13');
      expect(
        isInNotificationWindow(planDate, '09:45', 'Asia/Ho_Chi_Minh', now),
      ).toBe(true);
    });

    it('should return true for 30 minutes away (within 45 min)', () => {
      const now = new Date('2026-04-13T02:00:00Z');
      const planDate = new Date('2026-04-13');
      expect(
        isInNotificationWindow(planDate, '09:30', 'Asia/Ho_Chi_Minh', now),
      ).toBe(true);
    });

    it('should return false for 50 minutes away (more than 45 min)', () => {
      const now = new Date('2026-04-13T02:00:00Z');
      const planDate = new Date('2026-04-13');
      expect(
        isInNotificationWindow(planDate, '09:50', 'Asia/Ho_Chi_Minh', now),
      ).toBe(false);
    });

    it('should return false for already passed plans (UTC-4)', () => {
      const now = new Date('2026-04-13T14:00:00Z');
      const planDate = new Date('2026-04-13');
      expect(
        isInNotificationWindow(planDate, '09:45', 'America/New_York', now),
      ).toBe(false);
    });

    it('should return false for plan starting exactly now', () => {
      const now = new Date('2026-04-13T02:00:00Z');
      const planDate = new Date('2026-04-13');
      expect(
        isInNotificationWindow(planDate, '09:00', 'Asia/Ho_Chi_Minh', now),
      ).toBe(false);
    });
  });

  describe('localHourInTimezone', () => {
    it('computes the local wall-clock hour for UTC+7', () => {
      // 02:00 UTC → 09:00 in Vietnam
      const now = new Date('2026-04-13T02:00:00Z');
      expect(localHourInTimezone('Asia/Ho_Chi_Minh', now)).toBe(9);
    });

    it('computes the local wall-clock hour for a negative offset', () => {
      // 02:00 UTC → 22:00 previous day in New York (UTC-4 in April / DST)
      const now = new Date('2026-04-13T02:00:00Z');
      expect(localHourInTimezone('America/New_York', now)).toBe(22);
    });

    it('falls back to UTC hour on a bad timezone', () => {
      const now = new Date('2026-04-13T02:00:00Z');
      expect(localHourInTimezone('Not/AZone', now)).toBe(2);
    });
  });

  describe('localDateInTimezone', () => {
    it('returns the UTC-midnight Date of the local calendar day', () => {
      // 2026-09-21 18:00 UTC is already 2026-09-22 in Vietnam
      const now = new Date('2026-09-21T18:00:00Z');
      expect(localDateInTimezone('Asia/Ho_Chi_Minh', now)).toEqual(
        new Date('2026-09-22T00:00:00Z'),
      );
    });

    it('rolls back a day for negative offsets', () => {
      // 2026-09-22 02:00 UTC is still 2026-09-21 in New York
      const now = new Date('2026-09-22T02:00:00Z');
      expect(localDateInTimezone('America/New_York', now)).toEqual(
        new Date('2026-09-21T00:00:00Z'),
      );
    });
  });
});
