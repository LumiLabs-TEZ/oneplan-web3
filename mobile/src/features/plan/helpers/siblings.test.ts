import type { PlanItemDto } from '../types';
import { daySiblings, prevNext } from './siblings';

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

describe('daySiblings', () => {
  it('groups by dayNumber in planning mode', () => {
    const a = makeItem({ dayNumber: 1, startTime: '09:00' });
    const b = makeItem({ dayNumber: 2, startTime: '08:00' });
    const c = makeItem({ dayNumber: 1, startTime: '08:00' });
    const result = daySiblings([a, b, c], a, true);
    expect(result.map((i) => i.id)).toEqual([c.id, a.id]);
  });

  it('groups by planDate outside planning mode', () => {
    const a = makeItem({ planDate: '2026-01-01', startTime: '09:00' });
    const b = makeItem({ planDate: '2026-01-02', startTime: '08:00' });
    const c = makeItem({ planDate: '2026-01-01', startTime: '08:00' });
    const result = daySiblings([a, b, c], a, false);
    expect(result.map((i) => i.id)).toEqual([c.id, a.id]);
  });

  it('sorts by start-time minutes ascending', () => {
    const a = makeItem({ dayNumber: 1, startTime: '10:00' });
    const b = makeItem({ dayNumber: 1, startTime: '09:30' });
    const result = daySiblings([a, b], a, true);
    expect(result.map((i) => i.id)).toEqual([b.id, a.id]);
  });

  it('sorts unparseable/missing start times last', () => {
    const a = makeItem({ dayNumber: 1, startTime: null });
    const b = makeItem({ dayNumber: 1, startTime: '08:00' });
    const c = makeItem({ dayNumber: 1, startTime: 'garbage' });
    const result = daySiblings([a, b, c], a, true);
    expect(result.map((i) => i.id)).toEqual([b.id, a.id, c.id]);
  });

  it('falls back to sortOrder when start times tie', () => {
    const a = makeItem({ dayNumber: 1, startTime: '08:00', sortOrder: 2 });
    const b = makeItem({ dayNumber: 1, startTime: '08:00', sortOrder: 1 });
    const result = daySiblings([a, b], a, true);
    expect(result.map((i) => i.id)).toEqual([b.id, a.id]);
  });

  it('falls back to id when start time and sortOrder both tie', () => {
    const a = makeItem({ dayNumber: 1, startTime: '08:00', sortOrder: 0 });
    const b = makeItem({ dayNumber: 1, startTime: '08:00', sortOrder: 0 });
    const result = daySiblings([b, a], a, true);
    expect(result.map((i) => i.id)).toEqual([a.id, b.id]);
  });

  it('excludes items from other days', () => {
    const a = makeItem({ dayNumber: 1 });
    const b = makeItem({ dayNumber: 2 });
    const result = daySiblings([a, b], a, true);
    expect(result).toEqual([a]);
  });

  it('includes the item itself even without a start time', () => {
    const a = makeItem({ dayNumber: 1, startTime: null });
    const result = daySiblings([a], a, true);
    expect(result).toEqual([a]);
  });
});

describe('prevNext', () => {
  it('returns prev/next around the middle item', () => {
    const a = makeItem();
    const b = makeItem();
    const c = makeItem();
    const siblings = [a, b, c];
    expect(prevNext(siblings, b.id)).toEqual({ prev: a, next: c });
  });

  it('returns null prev at the first item', () => {
    const a = makeItem();
    const b = makeItem();
    expect(prevNext([a, b], a.id)).toEqual({ prev: null, next: b });
  });

  it('returns null next at the last item', () => {
    const a = makeItem();
    const b = makeItem();
    expect(prevNext([a, b], b.id)).toEqual({ prev: a, next: null });
  });

  it('returns both null for a single-item list', () => {
    const a = makeItem();
    expect(prevNext([a], a.id)).toEqual({ prev: null, next: null });
  });

  it('returns both null when the id is not present', () => {
    const a = makeItem();
    expect(prevNext([a], 999)).toEqual({ prev: null, next: null });
  });
});
