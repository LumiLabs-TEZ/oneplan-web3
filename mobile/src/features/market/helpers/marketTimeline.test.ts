import type { MarketItem } from '../api/queries';
import { marketTimeline, ratingLabel, showUpdatedCaption } from './marketTimeline';

const item = (id: number, dayNumber: number, startTime: string | null, sortOrder = 0) =>
  ({
    id,
    dayNumber,
    startTime,
    sortOrder,
    title: `#${id}`,
    imageUrls: [],
  }) as unknown as MarketItem;

const t = (key: string, options?: Record<string, unknown>) =>
  options?.count != null ? `${String(options.count)} ratings` : key;

describe('marketTimeline', () => {
  it('filters by day and groups by hour in time order', () => {
    const rows = marketTimeline(
      [item(1, 1, '09:30'), item(2, 1, '09:05'), item(3, 1, '14:00'), item(4, 2, '08:00')],
      1,
    );
    expect(rows.map((r) => [r.hour, r.items.map((i) => i.id)])).toEqual([
      [9, [2, 1]],
      [14, [3]],
    ]);
  });

  it('breaks same-time ties by sortOrder then id', () => {
    const rows = marketTimeline(
      [item(5, 1, '10:00', 2), item(4, 1, '10:00', 1), item(3, 1, '10:00', 1)],
      1,
    );
    expect(rows[0]!.items.map((i) => i.id)).toEqual([3, 4, 5]);
  });

  it('keeps untimed items in a trailing unlabeled row', () => {
    const rows = marketTimeline(
      [item(1, 1, null, 1), item(2, 1, 'bad', 0), item(3, 1, '07:00')],
      1,
    );
    expect(rows.map((r) => [r.hour, r.items.map((i) => i.id)])).toEqual([
      [7, [3]],
      [null, [2, 1]],
    ]);
  });

  it('returns no rows for an empty day', () => {
    expect(marketTimeline([item(1, 1, '09:00')], 2)).toEqual([]);
  });
});

describe('ratingLabel', () => {
  it('shows the empty label without ratings', () => {
    expect(ratingLabel(null, 0, t)).toBe('No ratings yet');
    expect(ratingLabel('4.5', 0, t)).toBe('No ratings yet');
  });
  it('formats the average and count', () => {
    expect(ratingLabel('4.456', 12, t)).toBe('4.5 · 12 ratings');
    expect(ratingLabel('4', 1_200, t)).toBe('4.0 · 1K+ ratings');
    expect(ratingLabel('4', 12_000, t)).toBe('4.0 · 10K+ ratings');
  });
});

describe('showUpdatedCaption', () => {
  const created = '2026-01-01T00:00:00.000Z';
  it('needs ratings and an edit more than a minute after creation', () => {
    expect(showUpdatedCaption(created, '2026-01-01T00:02:00.000Z', 3)).toBe(true);
    expect(showUpdatedCaption(created, '2026-01-01T00:00:30.000Z', 3)).toBe(false);
    expect(showUpdatedCaption(created, '2026-01-01T00:02:00.000Z', 0)).toBe(false);
  });
});
