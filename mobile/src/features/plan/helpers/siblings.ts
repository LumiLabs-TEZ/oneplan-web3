/**
 * Prev/next sibling ordering for the plan-detail nav arrows. Port of
 * `PlanDetailView.swift` `navigationPlanItems` (:50-65) and the prev/next
 * button handlers (:161-169).
 */
import { parseHourMinute } from './planDays';
import type { PlanItemDto } from '../types';

/** Unparseable/missing start times sort last (`PlanDetailView.minutesSinceMidnight`, :375-380). */
function minutesSinceMidnight(startTime: string | null | undefined): number {
  const hm = parseHourMinute(startTime);
  return hm ? hm.hour * 60 + hm.minute : Number.MAX_SAFE_INTEGER;
}

/**
 * Items sharing `item`'s day — `dayNumber` in planning mode, else `planDate`
 * — ordered by start-time minutes (unparseable last), then `sortOrder`, then
 * `id`. Includes `item` itself.
 */
export function daySiblings(
  all: readonly PlanItemDto[],
  item: PlanItemDto,
  isPlanningMode: boolean,
): PlanItemDto[] {
  const group = isPlanningMode
    ? all.filter((i) => i.dayNumber === item.dayNumber)
    : all.filter((i) => i.planDate === item.planDate);

  return group.slice().sort((a, b) => {
    const am = minutesSinceMidnight(a.startTime);
    const bm = minutesSinceMidnight(b.startTime);
    if (am !== bm) return am - bm;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.id - b.id;
  });
}

/** The item immediately before/after `id` within an already-ordered sibling
 * list; `null` at either boundary or when `id` isn't present. */
export function prevNext(
  siblings: readonly PlanItemDto[],
  id: number,
): { prev: PlanItemDto | null; next: PlanItemDto | null } {
  const index = siblings.findIndex((i) => i.id === id);
  if (index === -1) return { prev: null, next: null };
  return {
    prev: index > 0 ? siblings[index - 1]! : null,
    next: index < siblings.length - 1 ? siblings[index + 1]! : null,
  };
}
