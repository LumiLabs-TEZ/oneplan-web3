import type { PlanItemDto } from '../types';
import { compareTodayItems, localDateString, todaysActivities } from './todaysActivities';

// 2026-03-15 10:00 local time
const NOW = new Date(2026, 2, 15, 10, 0, 0);
const TODAY = '2026-03-15';

function item(overrides: Partial<PlanItemDto> & { id: number }): PlanItemDto {
  return {
    tripId: 1,
    title: `Item ${overrides.id}`,
    planDate: TODAY,
    latitude: 10.5,
    longitude: 106.7,
    sortOrder: 0,
    imageUrls: [],
    createdAt: '2026-03-01T00:00:00.000Z',
    members: [],
    ...overrides,
  };
}

const ids = (pins: ReturnType<typeof todaysActivities>) => pins.map((p) => p.item.id);

describe('localDateString', () => {
  it('formats the local calendar date as YYYY-MM-DD', () => {
    expect(localDateString(NOW)).toBe(TODAY);
    expect(localDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('honours an explicit time zone', () => {
    // 23:30 UTC on the 15th is already the 16th in Ho Chi Minh City (UTC+7).
    const utc = new Date(Date.UTC(2026, 2, 15, 23, 30));
    expect(localDateString(utc, 'UTC')).toBe('2026-03-15');
    expect(localDateString(utc, 'Asia/Ho_Chi_Minh')).toBe('2026-03-16');
  });
});

describe('todaysActivities', () => {
  it('keeps only items whose planDate is today', () => {
    const pins = todaysActivities(
      [
        item({ id: 1, planDate: '2026-03-14' }),
        item({ id: 2 }),
        item({ id: 3, planDate: '2026-03-16' }),
        item({ id: 4, planDate: null }),
      ],
      NOW,
    );
    expect(ids(pins)).toEqual([2]);
  });

  it('skips items without numeric coordinates', () => {
    const pins = todaysActivities(
      [
        item({ id: 1, latitude: null }),
        item({ id: 2, longitude: undefined }),
        item({ id: 3, latitude: NaN }),
        item({ id: 4 }),
      ],
      NOW,
    );
    expect(ids(pins)).toEqual([4]);
  });

  it('orders timed items by startTime, untimed last', () => {
    const pins = todaysActivities(
      [
        item({ id: 1, startTime: null, sortOrder: 0 }),
        item({ id: 2, startTime: '14:00', sortOrder: 5 }),
        item({ id: 3, startTime: '09:30', sortOrder: 9 }),
      ],
      NOW,
    );
    expect(ids(pins)).toEqual([3, 2, 1]);
  });

  it('breaks ties by sortOrder then id', () => {
    const pins = todaysActivities(
      [
        item({ id: 30, startTime: '10:00', sortOrder: 2 }),
        item({ id: 20, startTime: '10:00', sortOrder: 1 }),
        item({ id: 10, startTime: '10:00', sortOrder: 2 }),
        item({ id: 3, startTime: null, sortOrder: 1 }),
        item({ id: 2, startTime: null, sortOrder: 1 }),
        item({ id: 1, startTime: null, sortOrder: 0 }),
      ],
      NOW,
    );
    expect(ids(pins)).toEqual([20, 10, 30, 1, 2, 3]);
  });

  it('assigns 1-based indexes in sorted order', () => {
    const pins = todaysActivities(
      [item({ id: 7, startTime: '12:00' }), item({ id: 8, startTime: '08:00' })],
      NOW,
    );
    expect(pins.map((p) => [p.index, p.item.id])).toEqual([
      [1, 8],
      [2, 7],
    ]);
  });

  it('uses the provided time zone to decide what "today" is', () => {
    const utc = new Date(Date.UTC(2026, 2, 15, 23, 30));
    const items = [item({ id: 1, planDate: '2026-03-16' })];
    expect(ids(todaysActivities(items, utc, { timeZone: 'UTC' }))).toEqual([]);
    expect(ids(todaysActivities(items, utc, { timeZone: 'Asia/Ho_Chi_Minh' }))).toEqual([1]);
  });

  it('compareTodayItems is antisymmetric', () => {
    const a = item({ id: 1, startTime: '09:00' });
    const b = item({ id: 2, startTime: null });
    expect(compareTodayItems(a, b)).toBeLessThan(0);
    expect(compareTodayItems(b, a)).toBeGreaterThan(0);
    expect(compareTodayItems(a, a)).toBe(0);
  });
});
