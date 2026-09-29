// Shared timezone helpers used by both the plan-reminder cron and the
// engagement-push cron. The offset math relies on Intl.DateTimeFormat's
// `shortOffset` output (e.g. "GMT+7", "GMT+5:30"), which is the only portable
// way to get an IANA zone's UTC offset at a given instant without a tz library.

interface TimezoneEntry {
  zoneName: string;
  gmtOffset: number;
}

/**
 * Parse a `Country.timezones` JSON blob and return the first IANA zone name
 * (e.g. "Asia/Ho_Chi_Minh"), or null if missing/malformed.
 */
export function parseTimezone(timezoneJson: string | null): string | null {
  if (!timezoneJson) return null;
  try {
    const parsed: TimezoneEntry[] = JSON.parse(timezoneJson);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].zoneName) {
      return parsed[0].zoneName;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * UTC offset (in minutes) for an IANA timezone at a given instant.
 * Returns 0 on any failure so callers degrade to UTC rather than throwing.
 */
export function timezoneOffsetMinutes(timezone: string, at: Date): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      timeZoneName: 'shortOffset',
    });
    const parts = formatter.formatToParts(at);
    const offsetPart = parts.find((p) => p.type === 'timeZoneName');
    if (!offsetPart) return 0;
    // "GMT+7" / "GMT-5" / "GMT+5:30" (and bare "GMT" → 0).
    const match = offsetPart.value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!match) return 0;
    const sign = match[1] === '+' ? 1 : -1;
    const offsetHours = parseInt(match[2], 10);
    const offsetMins = match[3] ? parseInt(match[3], 10) : 0;
    return sign * (offsetHours * 60 + offsetMins);
  } catch {
    return 0;
  }
}

/**
 * The local wall-clock hour [0..23] in `timezone` at instant `now`.
 * Used by the engagement send-window gate. Falls back to the UTC hour on error.
 */
export function localHourInTimezone(
  timezone: string,
  now: Date = new Date(),
): number {
  const offsetMinutes = timezoneOffsetMinutes(timezone, now);
  const localMs = now.getTime() + offsetMinutes * 60 * 1000;
  return new Date(localMs).getUTCHours();
}

/**
 * The local calendar date in `timezone` at instant `now`, expressed as a
 * UTC-midnight Date so it compares directly with `@db.Date` columns
 * (which Prisma materializes as UTC midnight). Falls back to the UTC date.
 */
export function localDateInTimezone(
  timezone: string,
  now: Date = new Date(),
): Date {
  const offsetMinutes = timezoneOffsetMinutes(timezone, now);
  const local = new Date(now.getTime() + offsetMinutes * 60 * 1000);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
}

/**
 * Checks if a plan item's start time is within 45 minutes from now.
 *
 * @param planDate - The calendar date of the plan (UTC midnight)
 * @param startTime - The start time in "HH:MM" format (in the trip's timezone)
 * @param timezone - IANA timezone identifier (e.g., "Asia/Ho_Chi_Minh")
 * @param now - Current time (defaults to new Date())
 * @returns true if the plan starts within 45 minutes and hasn't started yet
 */
export function isInNotificationWindow(
  planDate: Date,
  startTime: string,
  timezone: string,
  now: Date = new Date(),
): boolean {
  try {
    const [hours, minutes] = startTime.split(':').map(Number);
    const year = planDate.getUTCFullYear();
    const month = planDate.getUTCMonth();
    const day = planDate.getUTCDate();

    const tempDate = new Date(Date.UTC(year, month, day, hours, minutes, 0));
    const offsetMinutes = timezoneOffsetMinutes(timezone, tempDate);

    // Local time = UTC + offset, so UTC = Local - offset.
    const planStartUtc =
      Date.UTC(year, month, day, hours, minutes, 0) - offsetMinutes * 60 * 1000;

    const diffMinutes = (planStartUtc - now.getTime()) / (1000 * 60);
    return diffMinutes > 0 && diffMinutes <= 45;
  } catch {
    return false;
  }
}
