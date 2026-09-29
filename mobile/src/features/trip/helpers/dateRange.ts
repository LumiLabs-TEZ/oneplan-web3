/**
 * Pure date-range helpers backing the trip date pickers. All functions are
 * Date-in/Date-out at local start-of-day — never `toISOString()`, which
 * shifts across timezones. Range-tap rule ported from
 * `Component/BottomSheet/TripDurationBottomSheet.swift:105-122` (same rule in
 * `TripDatesBottomSheet.swift`).
 */

export type DateRange = { start: Date | null; end: Date | null };

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function applyRangeTap(range: DateRange, tapped: Date, today: Date): DateRange {
  const { start, end } = range;
  const n = startOfDay(tapped);
  if (n < startOfDay(today)) return { start, end };
  if (end) return { start: n, end: null };
  if (!start || n < start) return { start: n, end };
  if (n.getTime() === start.getTime()) return { start, end: null };
  return { start, end: n };
}

/** `end` defaults to `start`; the pair is returned min/max-ordered. */
export function normalizeRange(range: DateRange): { start: Date; end: Date } | null {
  if (!range.start) return null;
  const start = range.start;
  const end = range.end ?? range.start;
  return start.getTime() <= end.getTime() ? { start, end } : { start: end, end: start };
}

/** Clamps a range so neither bound falls before `minStart` — port of
 * `TripDatesBottomSheet.primeDraftSelection` / `TripDurationBottomSheet.resetDraftSelection`
 * (:109-122). */
export function clampRange(range: DateRange, minStart: Date): DateRange {
  const min = startOfDay(minStart);
  if (!range.start) return range;
  const start = range.start.getTime() < min.getTime() ? min : range.start;
  if (!range.end) return { start, end: null };
  const end = range.end.getTime() < start.getTime() ? start : range.end;
  return { start, end };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function toDateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * `yyyy-MM-dd` → local midnight. Also accepts the full ISO timestamps the server actually
 * sends for `Trip.startDate` / `endDate` (`2026-09-14T00:00:00.000Z` — a Postgres `date`
 * serialised by Prisma): the time part is dropped rather than parsed, so the calendar day is
 * the stored one regardless of the device time zone. Without this the trailing
 * `14T00:00:00.000Z` segment parses as `NaN` and every caller gets an Invalid Date
 * (`tripDatesLabel` then throws `RangeError: Invalid time value` and blanks trip detail).
 */
export function parseDateOnly(s: string): Date {
  const parts = s.slice(0, 10).split('-').map(Number);
  const [year = 1970, month = 1, day = 1] = parts;
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return new Date(NaN);
  }
  return new Date(year, month - 1, day);
}

export function formatMonthDay(d: Date, locale: 'en' | 'vi'): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(d);
}

/** Inclusive day count between two local dates (order-independent). */
export function dayCount(start: Date, end: Date): number {
  const a = startOfDay(start).getTime();
  const b = startOfDay(end).getTime();
  return Math.round(Math.abs(b - a) / 86_400_000) + 1;
}

/** Sunday-first month grid, `null` for leading/trailing blanks, ≤6 rows of 7. */
export function buildMonthGrid(year: number, month0: number): (Date | null)[][] {
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const leading = new Date(year, month0, 1).getDay();
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;

  const cells: (Date | null)[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNumber = i - leading + 1;
    cells.push(
      dayNumber >= 1 && dayNumber <= daysInMonth ? new Date(year, month0, dayNumber) : null,
    );
  }

  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/** `count` consecutive `{ year, month0 }` pairs starting at `today`'s month. */
export function monthsFrom(today: Date, count: number): { year: number; month0: number }[] {
  const startYear = today.getFullYear();
  const startMonth0 = today.getMonth();
  return Array.from({ length: count }, (_, i) => {
    const total = startMonth0 + i;
    return { year: startYear + Math.floor(total / 12), month0: ((total % 12) + 12) % 12 };
  });
}
