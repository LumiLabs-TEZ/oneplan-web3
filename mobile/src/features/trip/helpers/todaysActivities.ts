import type { PlanItemDto } from '../types';

export interface TodayPin {
  /** 1-based position on the map/list (iOS `PlanDayPin.index`). */
  index: number;
  item: PlanItemDto;
}

export interface TodaysActivitiesOptions {
  /** IANA zone for "today"; defaults to the device's local zone. */
  timeZone?: string;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** `YYYY-MM-DD` of `date` in the local zone (or `timeZone`), matching `PlanItemDto.planDate`. */
export function localDateString(date: Date, timeZone?: string): string {
  if (!timeZone) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function hasCoordinates(item: PlanItemDto): boolean {
  return (
    typeof item.latitude === 'number' &&
    Number.isFinite(item.latitude) &&
    typeof item.longitude === 'number' &&
    Number.isFinite(item.longitude)
  );
}

/**
 * Port of `HomeView.todayPins` ordering: "HH:MM" strings compare
 * lexicographically; timed items before untimed; then `sortOrder`, then `id`.
 */
export function compareTodayItems(lhs: PlanItemDto, rhs: PlanItemDto): number {
  const l = lhs.startTime ?? null;
  const r = rhs.startTime ?? null;
  if (l !== null && r !== null && l !== r) return l < r ? -1 : 1;
  if (l !== null && r === null) return -1;
  if (l === null && r !== null) return 1;
  if (lhs.sortOrder !== rhs.sortOrder) return lhs.sortOrder - rhs.sortOrder;
  return lhs.id - rhs.id;
}

/**
 * Today's plan items that can be pinned on a map (`HomeView.swift` `todayPins`):
 * `planDate === today`, numeric `latitude` + `longitude`, sorted per
 * `compareTodayItems`, indexed from 1.
 */
export function todaysActivities(
  planItems: readonly PlanItemDto[],
  now: Date = new Date(),
  opts: TodaysActivitiesOptions = {},
): TodayPin[] {
  const today = localDateString(now, opts.timeZone);
  return planItems
    .filter((item) => item.planDate === today && hasCoordinates(item))
    .sort(compareTodayItems)
    .map((item, offset) => ({ index: offset + 1, item }));
}
