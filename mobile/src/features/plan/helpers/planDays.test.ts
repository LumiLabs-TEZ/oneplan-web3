import type { PlanItemDto } from '@/features/trip/types';
import {
  addDayOps,
  applyOpsLocally,
  availableDays,
  canAddDay,
  dateForDay,
  dayChipLabel,
  dayForDate,
  dayMapPins,
  deleteDayOps,
  initialDay,
  orderedDayItems,
  parseHourMinute,
  planningDayCount,
  rearrangeOps,
  renderedTimeline,
  sortTimed,
  visibleItems,
  type DayContext,
} from './planDays';

let nextId = 1;
function makeItem(overrides: Partial<PlanItemDto> = {}): PlanItemDto {
  return {
    id: nextId++,
    tripId: 1,
    title: 'Item',
    imageUrls: [],
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    members: [],
    ...overrides,
  };
}

beforeEach(() => {
  nextId = 1;
});

function planningCtx(items: PlanItemDto[]): DayContext {
  return { isPlanningMode: true, startDate: null, endDate: null, planItems: items };
}

function dateCtx(
  items: PlanItemDto[],
  startDate: string,
  endDate: string,
  isPlanningMode = false,
): DayContext {
  return { isPlanningMode, startDate, endDate, planItems: items };
}

describe('planningDayCount', () => {
  it('is at least 1 with no items', () => {
    expect(planningDayCount([])).toBe(1);
  });

  it('is the max dayNumber across items', () => {
    expect(planningDayCount([makeItem({ dayNumber: 2 }), makeItem({ dayNumber: 5 })])).toBe(5);
  });

  it('ignores items without a dayNumber', () => {
    expect(planningDayCount([makeItem({ dayNumber: null }), makeItem({ dayNumber: 3 })])).toBe(3);
  });
});

describe('availableDays', () => {
  it('falls back to planningDayCount when no dates are set', () => {
    const ctx = planningCtx([makeItem({ dayNumber: 4 })]);
    expect(availableDays(ctx)).toEqual([1, 2, 3, 4]);
  });

  it('is never empty', () => {
    expect(availableDays(planningCtx([]))).toEqual([1]);
  });

  it('derives from the date range when both dates are set', () => {
    const ctx = dateCtx([], '2026-03-01', '2026-03-05');
    expect(availableDays(ctx)).toEqual([1, 2, 3, 4, 5]);
  });

  it('falls back when endDate precedes startDate', () => {
    const ctx = {
      isPlanningMode: true,
      startDate: '2026-03-05',
      endDate: '2026-03-01',
      planItems: [makeItem({ dayNumber: 2 })],
    };
    expect(availableDays(ctx)).toEqual([1, 2]);
  });

  it('falls back when only one date bound is set', () => {
    const ctx = {
      isPlanningMode: true,
      startDate: '2026-03-01',
      endDate: null,
      planItems: [makeItem({ dayNumber: 3 })],
    };
    expect(availableDays(ctx)).toEqual([1, 2, 3]);
  });
});

describe('canAddDay', () => {
  it('is true below 14 days', () => {
    expect(canAddDay(dateCtx([], '2026-01-01', '2026-01-05'))).toBe(true);
  });

  it('is false at 14 days', () => {
    expect(canAddDay(dateCtx([], '2026-01-01', '2026-01-14'))).toBe(false);
  });

  it('is false above 14 days', () => {
    expect(canAddDay(dateCtx([], '2026-01-01', '2026-01-20'))).toBe(false);
  });
});

describe('dateForDay', () => {
  it('returns null when startDate is null', () => {
    expect(dateForDay(null, 1)).toBeNull();
  });

  it('returns null for day < 1', () => {
    expect(dateForDay('2026-03-01', 0)).toBeNull();
  });

  it('returns start date for day 1', () => {
    expect(dateForDay('2026-03-01', 1)).toBe('2026-03-01');
  });

  it('adds day-1 days to the start date, rolling over months', () => {
    expect(dateForDay('2026-03-30', 3)).toBe('2026-04-01');
  });
});

describe('dayForDate', () => {
  it('returns null when startDate is null', () => {
    expect(dayForDate(null, '2026-03-01')).toBeNull();
  });

  it('returns null when date is null', () => {
    expect(dayForDate('2026-03-01', null)).toBeNull();
  });

  it('returns 1 for a date equal to the start date', () => {
    expect(dayForDate('2026-03-01', '2026-03-01')).toBe(1);
  });

  it('returns the day number for a later date, rolling over months', () => {
    expect(dayForDate('2026-03-30', '2026-04-01')).toBe(3);
  });

  it('returns null when the date precedes the start date', () => {
    expect(dayForDate('2026-03-05', '2026-03-01')).toBeNull();
  });

  it('round-trips with dateForDay', () => {
    expect(dayForDate('2026-03-01', dateForDay('2026-03-01', 7))).toBe(7);
    expect(dateForDay('2026-03-01', dayForDate('2026-03-01', '2026-03-10')!)).toBe('2026-03-10');
  });
});

describe('dayChipLabel', () => {
  it('dateLabel is null and dayNumber echoes day when there is no start date', () => {
    const ctx = planningCtx([]);
    expect(dayChipLabel(ctx, 2, 'en')).toEqual({ dateLabel: null, dayNumber: 2 });
  });

  it('dateLabel is the locale-formatted date when a start date is set (en)', () => {
    const ctx = dateCtx([], '2026-03-01', '2026-03-05');
    expect(dayChipLabel(ctx, 1, 'en')).toEqual({ dateLabel: 'Mar 1', dayNumber: 1 });
  });

  it('dateLabel is locale-formatted for vi', () => {
    const ctx = dateCtx([], '2026-03-01', '2026-03-05');
    expect(dayChipLabel(ctx, 1, 'vi')).toEqual({ dateLabel: '1 thg 3', dayNumber: 1 });
  });
});

describe('initialDay', () => {
  it('is the first day while trip is PLANNING', () => {
    const ctx = dateCtx([], '2026-03-01', '2026-03-05', true);
    expect(initialDay(ctx, new Date(2026, 2, 3), 'PLANNING')).toBe(1);
  });

  it('offsets by elapsed days for an ongoing trip', () => {
    const ctx = dateCtx([], '2026-03-01', '2026-03-05', false);
    expect(initialDay(ctx, new Date(2026, 2, 3), 'ONGOING')).toBe(3);
  });

  it('clamps to the last day when today is past the trip end', () => {
    const ctx = dateCtx([], '2026-03-01', '2026-03-05', false);
    expect(initialDay(ctx, new Date(2026, 2, 20), 'ENDED')).toBe(5);
  });

  it('clamps to the first day when today is before the trip start', () => {
    const ctx = dateCtx([], '2026-03-10', '2026-03-15', false);
    expect(initialDay(ctx, new Date(2026, 2, 1), 'ONGOING')).toBe(1);
  });
});

describe('parseHourMinute', () => {
  it('parses a valid HH:MM', () => {
    expect(parseHourMinute('09:30')).toEqual({ hour: 9, minute: 30 });
  });

  it('returns null for missing input', () => {
    expect(parseHourMinute(null)).toBeNull();
    expect(parseHourMinute(undefined)).toBeNull();
  });

  it('returns null for out-of-range hour/minute', () => {
    expect(parseHourMinute('24:00')).toBeNull();
    expect(parseHourMinute('10:60')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(parseHourMinute('not-a-time')).toBeNull();
  });
});

describe('visibleItems', () => {
  it('filters by dayNumber in planning mode', () => {
    const items = [makeItem({ dayNumber: 1 }), makeItem({ dayNumber: 2 })];
    const ctx = planningCtx(items);
    expect(visibleItems(ctx, 2)).toEqual([items[1]]);
  });

  it('filters by planDate in date mode', () => {
    const items = [makeItem({ planDate: '2026-03-01' }), makeItem({ planDate: '2026-03-02' })];
    const ctx = dateCtx(items, '2026-03-01', '2026-03-05');
    expect(visibleItems(ctx, 2)).toEqual([items[1]]);
  });

  it('returns [] when the date cannot be resolved', () => {
    const ctx = { isPlanningMode: false, startDate: null, endDate: null, planItems: [makeItem()] };
    expect(visibleItems(ctx, 1)).toEqual([]);
  });
});

describe('sortTimed', () => {
  it('sorts by hour, then minute, then sortOrder, then id', () => {
    const a = makeItem({ startTime: '10:00', sortOrder: 0 });
    const b = makeItem({ startTime: '09:00', sortOrder: 0 });
    const c = makeItem({ startTime: '09:00', sortOrder: 0 });
    const items = [a, b, c];
    expect(sortTimed(items)).toEqual([b, c, a]);
  });

  it('excludes items without a valid start time', () => {
    const timed = makeItem({ startTime: '09:00' });
    const untimed = makeItem({ startTime: null });
    expect(sortTimed([untimed, timed])).toEqual([timed]);
  });
});

describe('orderedDayItems', () => {
  it('places timed items before untimed, each internally sorted', () => {
    const untimed1 = makeItem({ startTime: null, sortOrder: 1 });
    const untimed2 = makeItem({ startTime: null, sortOrder: 0 });
    const timed = makeItem({ startTime: '08:00' });
    expect(orderedDayItems([untimed1, untimed2, timed])).toEqual([timed, untimed2, untimed1]);
  });
});

describe('dayMapPins', () => {
  it('includes only items with coordinates, re-numbered from 1', () => {
    const noCoords = makeItem({ startTime: '08:00' });
    const withCoords = makeItem({
      startTime: '09:00',
      latitude: 10,
      longitude: 20,
      location: 'Cafe',
    });
    const pins = dayMapPins([noCoords, withCoords]);
    expect(pins).toEqual([
      {
        id: withCoords.id,
        index: 1,
        title: withCoords.title,
        latitude: 10,
        longitude: 20,
        subtitle: 'Cafe',
        timeLabel: '09:00',
      },
    ]);
  });

  it('returns [] when no items have coordinates', () => {
    expect(dayMapPins([makeItem()])).toEqual([]);
  });
});

describe('renderedTimeline', () => {
  it('only includes timed items', () => {
    const timed = makeItem({ startTime: '09:00' });
    const untimed = makeItem({ startTime: null });
    const entries = renderedTimeline([timed, untimed], 'en');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.item).toBe(timed);
  });

  it('hides the time label when it matches the previous entry', () => {
    const a = makeItem({ startTime: '09:00', sortOrder: 0 });
    const b = makeItem({ startTime: '09:00', sortOrder: 1 });
    const entries = renderedTimeline([a, b], 'en');
    expect(entries[0]!.timeLabel).toBe('09:00');
    expect(entries[1]!.timeLabel).toBeNull();
  });

  it('computes distance and route to the next timed item when both have coords', () => {
    const a = makeItem({ startTime: '09:00', latitude: 10, longitude: 20, location: 'A place' });
    const b = makeItem({
      startTime: '10:00',
      latitude: 10.01,
      longitude: 20.01,
      title: 'B',
      address: ' 1 Main St ',
    });
    const entries = renderedTimeline([a, b], 'en');
    expect(entries[0]!.distanceToNext).toMatch(/km$/);
    expect(entries[0]!.routeToNext).toEqual({
      from: { latitude: 10, longitude: 20 },
      to: { latitude: 10.01, longitude: 20.01 },
      fromName: 'A place',
      toName: 'B',
      fromAddress: null,
      toAddress: '1 Main St',
    });
  });

  it('is null distance/route when coordinates are missing', () => {
    const a = makeItem({ startTime: '09:00' });
    const b = makeItem({ startTime: '10:00' });
    const entries = renderedTimeline([a, b], 'en');
    expect(entries[0]!.distanceToNext).toBeNull();
    expect(entries[0]!.routeToNext).toBeNull();
  });

  it('marks the last entry with isLast', () => {
    const a = makeItem({ startTime: '09:00' });
    const b = makeItem({ startTime: '10:00' });
    const entries = renderedTimeline([a, b], 'en');
    expect(entries[0]!.isLast).toBe(false);
    expect(entries[1]!.isLast).toBe(true);
  });
});

describe('addDayOps', () => {
  it('extends endDate by one day when dates are scheduled', () => {
    const ctx = dateCtx([], '2026-03-01', '2026-03-05');
    expect(addDayOps(ctx)).toEqual([
      { kind: 'tripDates', startDate: '2026-03-01', endDate: '2026-03-06' },
    ]);
  });

  it('returns [] with no dates (caller bumps the local counter)', () => {
    expect(addDayOps(planningCtx([]))).toEqual([]);
  });

  it('returns [] once at 14 days', () => {
    const ctx = dateCtx([], '2026-03-01', '2026-03-14');
    expect(addDayOps(ctx)).toEqual([]);
  });
});

describe('deleteDayOps', () => {
  it('returns [] when only one day is available', () => {
    expect(deleteDayOps(planningCtx([]), 1)).toEqual([]);
  });

  it('returns [] for an out-of-range day', () => {
    const ctx = planningCtx([makeItem({ dayNumber: 2 })]);
    expect(deleteDayOps(ctx, 5)).toEqual([]);
  });

  it('planning mode: deletes items on the day and shifts later dayNumbers down', () => {
    const onDay1 = makeItem({ dayNumber: 1 });
    const onDay2 = makeItem({ dayNumber: 2 });
    const onDay3 = makeItem({ dayNumber: 3 });
    const ctx = planningCtx([onDay1, onDay2, onDay3]);
    const ops = deleteDayOps(ctx, 2);
    expect(ops).toEqual([
      { kind: 'delete', id: onDay2.id },
      { kind: 'patch', id: onDay3.id, body: { dayNumber: 2 } },
    ]);
  });

  it('planning mode: also shrinks endDate when dates are scheduled', () => {
    const onDay1 = makeItem({ dayNumber: 1 });
    const onDay2 = makeItem({ dayNumber: 2 });
    const ctx = dateCtx([onDay1, onDay2], '2026-03-01', '2026-03-02', true);
    const ops = deleteDayOps(ctx, 1);
    expect(ops).toEqual([
      { kind: 'delete', id: onDay1.id },
      { kind: 'patch', id: onDay2.id, body: { dayNumber: 1 } },
      { kind: 'tripDates', startDate: '2026-03-01', endDate: '2026-03-01' },
    ]);
  });

  it('date mode: deletes items on the date, shifts later planDates back, and shrinks endDate', () => {
    const onDate1 = makeItem({ planDate: '2026-03-01' });
    const onDate2 = makeItem({ planDate: '2026-03-02' });
    const onDate3 = makeItem({ planDate: '2026-03-03' });
    const ctx = dateCtx([onDate1, onDate2, onDate3], '2026-03-01', '2026-03-03', false);
    const ops = deleteDayOps(ctx, 2);
    expect(ops).toEqual([
      { kind: 'delete', id: onDate2.id },
      { kind: 'patch', id: onDate3.id, body: { planDate: '2026-03-02' } },
      { kind: 'tripDates', startDate: '2026-03-01', endDate: '2026-03-02' },
    ]);
  });
});

describe('rearrangeOps', () => {
  it('returns [] on a length mismatch', () => {
    const ctx = planningCtx([makeItem({ dayNumber: 1 }), makeItem({ dayNumber: 2 })]);
    expect(rearrangeOps(ctx, [1])).toEqual([]);
  });

  it('planning mode: patches only the items whose dayNumber changed', () => {
    const a = makeItem({ dayNumber: 1 });
    const b = makeItem({ dayNumber: 2 });
    const ctx = planningCtx([a, b]);
    // New order: day 2 first, day 1 second -> day2 becomes 1, day1 becomes 2.
    const ops = rearrangeOps(ctx, [2, 1]);
    expect(ops).toEqual([
      { kind: 'patch', id: a.id, body: { dayNumber: 2 } },
      { kind: 'patch', id: b.id, body: { dayNumber: 1 } },
    ]);
  });

  it('date mode: translates day numbers to planDate strings before patching', () => {
    const onDate1 = makeItem({ planDate: '2026-03-01' });
    const onDate2 = makeItem({ planDate: '2026-03-02' });
    const ctx = dateCtx([onDate1, onDate2], '2026-03-01', '2026-03-02', false);
    const ops = rearrangeOps(ctx, [2, 1]);
    expect(ops).toEqual([
      { kind: 'patch', id: onDate1.id, body: { planDate: '2026-03-02' } },
      { kind: 'patch', id: onDate2.id, body: { planDate: '2026-03-01' } },
    ]);
  });

  it('does not patch items whose target day is unchanged', () => {
    const a = makeItem({ dayNumber: 1 });
    const b = makeItem({ dayNumber: 2 });
    const ctx = planningCtx([a, b]);
    expect(rearrangeOps(ctx, [1, 2])).toEqual([]);
  });
});

describe('applyOpsLocally', () => {
  it('removes deleted items', () => {
    const a = makeItem();
    const b = makeItem();
    expect(applyOpsLocally([a, b], [{ kind: 'delete', id: a.id }])).toEqual([b]);
  });

  it('merges patch bodies', () => {
    const a = makeItem({ dayNumber: 1 });
    const [patched] = applyOpsLocally([a], [{ kind: 'patch', id: a.id, body: { dayNumber: 3 } }]);
    expect(patched!.dayNumber).toBe(3);
  });

  it('ignores tripDates ops (they target the trip, not plan items)', () => {
    const a = makeItem();
    const result = applyOpsLocally(
      [a],
      [{ kind: 'tripDates', startDate: '2026-01-01', endDate: '2026-01-02' }],
    );
    expect(result).toEqual([a]);
  });
});
