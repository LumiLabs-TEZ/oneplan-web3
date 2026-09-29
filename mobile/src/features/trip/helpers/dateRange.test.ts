import {
  applyRangeTap,
  buildMonthGrid,
  clampRange,
  type DateRange,
  dayCount,
  formatMonthDay,
  monthsFrom,
  normalizeRange,
  parseDateOnly,
  startOfDay,
  toDateOnly,
} from './dateRange';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('startOfDay', () => {
  it('zeroes the time components', () => {
    const result = startOfDay(new Date(2026, 8, 14, 23, 59, 59));
    expect(result).toEqual(new Date(2026, 8, 14, 0, 0, 0, 0));
  });
});

describe('applyRangeTap', () => {
  const today = d(2026, 9, 14);
  const empty: DateRange = { start: null, end: null };

  it('ignores a tap on a date before today', () => {
    const result = applyRangeTap(empty, d(2026, 9, 10), today);
    expect(result).toEqual(empty);
  });

  it('sets start on the first tap', () => {
    const result = applyRangeTap(empty, d(2026, 9, 15), today);
    expect(result).toEqual({ start: d(2026, 9, 15), end: null });
  });

  it('sets end on a later second tap', () => {
    const range: DateRange = { start: d(2026, 9, 15), end: null };
    const result = applyRangeTap(range, d(2026, 9, 20), today);
    expect(result).toEqual({ start: d(2026, 9, 15), end: d(2026, 9, 20) });
  });

  it('moves start when tapping before the current start', () => {
    const range: DateRange = { start: d(2026, 9, 15), end: null };
    const result = applyRangeTap(range, d(2026, 9, 14), today);
    expect(result).toEqual({ start: d(2026, 9, 14), end: null });
  });

  it('clears end when tapping the start date again', () => {
    const range: DateRange = { start: d(2026, 9, 15), end: null };
    const result = applyRangeTap(range, d(2026, 9, 15), today);
    expect(result).toEqual({ start: d(2026, 9, 15), end: null });
  });

  it('restarts the range when tapping while an end is already set', () => {
    const range: DateRange = { start: d(2026, 9, 15), end: d(2026, 9, 20) };
    const result = applyRangeTap(range, d(2026, 9, 18), today);
    expect(result).toEqual({ start: d(2026, 9, 18), end: null });
  });

  it('keeps the range unchanged when today itself is tapped and equals start', () => {
    const result = applyRangeTap(empty, today, today);
    expect(result).toEqual({ start: today, end: null });
  });
});

describe('normalizeRange', () => {
  it('returns null when there is no start', () => {
    expect(normalizeRange({ start: null, end: null })).toBeNull();
  });

  it('defaults end to start when end is null', () => {
    const start = d(2026, 9, 15);
    expect(normalizeRange({ start, end: null })).toEqual({ start, end: start });
  });

  it('swaps start and end when start is after end', () => {
    const start = d(2026, 9, 20);
    const end = d(2026, 9, 15);
    expect(normalizeRange({ start, end })).toEqual({ start: end, end: start });
  });

  it('leaves an already-ordered range untouched', () => {
    const start = d(2026, 9, 15);
    const end = d(2026, 9, 20);
    expect(normalizeRange({ start, end })).toEqual({ start, end });
  });
});

describe('clampRange', () => {
  const minStart = d(2026, 9, 14);

  it('clamps a start before minStart up to minStart', () => {
    const result = clampRange({ start: d(2026, 9, 1), end: null }, minStart);
    expect(result).toEqual({ start: minStart, end: null });
  });

  it('clamps end up to the clamped start when end is also before minStart', () => {
    const result = clampRange({ start: d(2026, 9, 1), end: d(2026, 9, 2) }, minStart);
    expect(result).toEqual({ start: minStart, end: minStart });
  });

  it('leaves a range already at/after minStart unchanged', () => {
    const range: DateRange = { start: d(2026, 9, 15), end: d(2026, 9, 20) };
    expect(clampRange(range, minStart)).toEqual(range);
  });

  it('passes through an empty range', () => {
    expect(clampRange({ start: null, end: null }, minStart)).toEqual({ start: null, end: null });
  });
});

describe('toDateOnly / parseDateOnly', () => {
  it('formats a local date as yyyy-MM-dd', () => {
    expect(toDateOnly(d(2026, 1, 5))).toBe('2026-01-05');
  });

  it('round-trips through parseDateOnly', () => {
    const original = d(2026, 9, 14);
    expect(parseDateOnly(toDateOnly(original))).toEqual(original);
  });

  // The server sends `Trip.startDate` / `endDate` as full ISO timestamps, not `yyyy-MM-dd`.
  it('parses the ISO timestamps the API actually returns, keeping the stored calendar day', () => {
    expect(parseDateOnly('2026-09-14T00:00:00.000Z')).toEqual(d(2026, 9, 14));
  });

  it('returns an Invalid Date for junk instead of a silently wrong one', () => {
    expect(Number.isNaN(parseDateOnly('not-a-date').getTime())).toBe(true);
  });
});

describe('formatMonthDay', () => {
  it('formats en as "MMM d"', () => {
    expect(formatMonthDay(d(2026, 9, 14), 'en')).toBe('Sep 14');
  });
});

describe('dayCount', () => {
  it('counts inclusively', () => {
    expect(dayCount(d(2026, 9, 14), d(2026, 9, 14))).toBe(1);
    expect(dayCount(d(2026, 9, 14), d(2026, 9, 20))).toBe(7);
  });
});

describe('buildMonthGrid', () => {
  it('lays out September 2026 (starts on Tuesday) as 5 rows with 2 leading nulls', () => {
    const grid = buildMonthGrid(2026, 8);
    expect(grid).toHaveLength(5);
    expect(grid[0]).toEqual([
      null,
      null,
      d(2026, 9, 1),
      d(2026, 9, 2),
      d(2026, 9, 3),
      d(2026, 9, 4),
      d(2026, 9, 5),
    ]);
    expect(grid.every((row) => row.length === 7)).toBe(true);
    const flat = grid.flat().filter((x): x is Date => x !== null);
    expect(flat).toHaveLength(30);
    expect(flat[flat.length - 1]).toEqual(d(2026, 9, 30));
  });
});

describe('monthsFrom', () => {
  it('rolls over into the next year', () => {
    const months = monthsFrom(d(2026, 11, 1), 3);
    expect(months).toEqual([
      { year: 2026, month0: 10 },
      { year: 2026, month0: 11 },
      { year: 2027, month0: 0 },
    ]);
  });
});
