import type { PlanItemDto } from '../types';

import { lostPlanItems } from './scheduleGuard';

const item = (id: number, dayNumber: number | null): PlanItemDto =>
  ({ id, dayNumber }) as PlanItemDto;

describe('lostPlanItems', () => {
  const items = [item(1, 1), item(2, 3), item(3, 5), item(4, null)];

  it('returns the items sitting past the new last day', () => {
    expect(lostPlanItems(items, 3).map((i) => i.id)).toEqual([3]);
    expect(lostPlanItems(items, 1).map((i) => i.id)).toEqual([2, 3]);
  });

  it('returns nothing when the schedule grows or stays the same', () => {
    expect(lostPlanItems(items, 5)).toEqual([]);
    expect(lostPlanItems(items, 9)).toEqual([]);
  });

  it('never loses day-less (date-anchored) items', () => {
    expect(lostPlanItems([item(4, null)], 1)).toEqual([]);
  });

  it('tolerates a missing plan-item list', () => {
    expect(lostPlanItems(undefined, 2)).toEqual([]);
  });
});
