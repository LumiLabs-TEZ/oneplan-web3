/**
 * Day availability / visible items / timeline ordering / day-operation
 * planners for the plan (itinerary) screens.
 *
 * Ports (see also class-level comments below each function):
 * - `ios/OnePlan/OnePlan/Component/Trip/TripPlanSection.swift:125-262`
 * - `ios/OnePlan/OnePlan/Services/TripDetailService.swift:1421-1436, 1473-1560, 1677-1760`
 *
 * There are no server-side reorder/day endpoints (see constraints.md): every
 * day operation here is expressed as a list of `PlanOp`s (N x PATCH/DELETE +
 * an optional trip-dates PATCH) that the caller fires sequentially, mirroring
 * the optimistic-local-update-then-fire-and-forget pattern in
 * `TripDetailService`.
 */

import type { components } from '@/api/schema';
import type { PlanItemDto, TripStatus } from '@/features/trip/types';
import {
  dayCount,
  formatMonthDay,
  parseDateOnly,
  startOfDay,
  toDateOnly,
} from '@/features/trip/helpers/dateRange';
import { formatDistanceKm, haversineMeters, type LatLng } from './geo';
import { hhmm } from './timeLabel';

type UpdatePlanItemDto = components['schemas']['UpdatePlanItemDto'];

const MAX_PLANNING_DAYS = 14;

export interface DayContext {
  isPlanningMode: boolean;
  startDate: string | null;
  endDate: string | null;
  planItems: readonly PlanItemDto[];
}

/** Number of calendar days in `[startDate, endDate]` inclusive, or `null` when
 * either bound is missing/invalid or `endDate` precedes `startDate`
 * (`TripDetailService.scheduledDayCount`, :1440-1453). */
function scheduledDayCount(ctx: DayContext): number | null {
  if (!ctx.startDate || !ctx.endDate) return null;
  const start = parseDateOnly(ctx.startDate);
  const end = parseDateOnly(ctx.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end.getTime() < start.getTime()) return null;
  return dayCount(start, end);
}

function addDaysToDateString(dateStr: string, delta: number): string {
  const d = parseDateOnly(dateStr);
  d.setDate(d.getDate() + delta);
  return toDateOnly(d);
}

/** `Array#length` of the day chip strip when the trip has no scheduled dates:
 * `max(dayNumber)` across items, floored at 1 (`TripDetailService.unlockedDayNumbers`,
 * :1421-1425). */
export function planningDayCount(items: readonly PlanItemDto[]): number {
  let max = 0;
  for (const item of items) {
    if (typeof item.dayNumber === 'number' && item.dayNumber > max) max = item.dayNumber;
  }
  return Math.max(max, 1);
}

/** `1..N` day numbers, never empty. Uses the scheduled date range when both
 * `startDate`/`endDate` are set (and valid), else falls back to
 * `planningDayCount` (`TripDetailService.availablePlanningDays`, :1431-1436). */
export function availableDays(ctx: DayContext): number[] {
  const scheduled = scheduledDayCount(ctx);
  const total = scheduled != null ? Math.max(scheduled, 1) : planningDayCount(ctx.planItems);
  return Array.from({ length: total }, (_, i) => i + 1);
}

/** `true` while more days can be added (`< 14` total days). */
export function canAddDay(ctx: DayContext): boolean {
  return availableDays(ctx).length < MAX_PLANNING_DAYS;
}

/** `yyyy-MM-dd` for the date corresponding to a 1-based day number, given
 * `startDate`. `null` when `startDate` is unset or `day < 1`
 * (`TripDetailService.planDateString`, :1466-1469). */
export function dateForDay(startDate: string | null, day: number): string | null {
  if (!startDate || day < 1) return null;
  const start = parseDateOnly(startDate);
  if (Number.isNaN(start.getTime())) return null;
  const d = new Date(start);
  d.setDate(d.getDate() + (day - 1));
  return toDateOnly(d);
}

/** Inverse of `dateForDay`: the 1-based day number for a `yyyy-MM-dd` date,
 * given `startDate`. `null` when either bound is missing/invalid or the
 * result would be `< 1` (date precedes the trip start). */
export function dayForDate(startDate: string | null, date: string | null): number | null {
  if (!startDate || !date) return null;
  const start = parseDateOnly(startDate);
  const d = parseDateOnly(date);
  if (Number.isNaN(start.getTime()) || Number.isNaN(d.getTime())) return null;
  const diffDays = Math.round((startOfDay(d).getTime() - startOfDay(start).getTime()) / 86_400_000);
  const day = diffDays + 1;
  return day < 1 ? null : day;
}

/**
 * Chip data for a day: `dateLabel` is the locale-formatted date (`'MMM d'`)
 * when the trip has a start date, else `null`; `dayNumber` echoes `day`.
 * Helpers never produce user-facing translated strings — the consuming
 * component renders `dayNumber` itself (e.g. `t('Day %lld', { 0: dayNumber })`).
 */
export function dayChipLabel(
  ctx: DayContext,
  day: number,
  locale: 'en' | 'vi',
): { dateLabel: string | null; dayNumber: number } {
  const date = dateForDay(ctx.startDate, day);
  return {
    dateLabel: date ? formatMonthDay(parseDateOnly(date), locale) : null,
    dayNumber: day,
  };
}

/** Initial selected day: for `PLANNING` trips, the first available day; for
 * ongoing/ended trips, the first day offset by the number of days elapsed
 * since the trip's start date, clamped to `[first, last]`
 * (`TripPlanSection.selectInitialDay`, :125-145). */
export function initialDay(ctx: DayContext, today: Date, status: TripStatus): number {
  const days = availableDays(ctx);
  const first = days[0]!;
  const last = days[days.length - 1]!;
  if (status === 'PLANNING') return first;

  const startDateString = dateForDay(ctx.startDate, first);
  if (!startDateString) return first;
  const start = startOfDay(parseDateOnly(startDateString));
  const offset = Math.round((startOfDay(today).getTime() - start.getTime()) / 86_400_000);
  const candidate = first + offset;
  return Math.max(first, Math.min(candidate, last));
}

/** Parses an `HH:MM` (or `H:MM`) start time; `null` when missing/out of range
 * (`TripPlanSection.parseHourMinute`, :352-364). */
export function parseHourMinute(
  startTime: string | null | undefined,
): { hour: number; minute: number } | null {
  if (!startTime) return null;
  const parts = startTime.trim().split(':');
  if (parts.length < 2) return null;
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** Items visible on a given day: `dayNumber === day` during planning, else
 * `planDate === dateForDay(day)`; `[]` when the date can't be resolved
 * (`TripPlanSection.visiblePlanItems`, :149-157). */
export function visibleItems(ctx: DayContext, day: number): PlanItemDto[] {
  if (ctx.isPlanningMode) {
    return ctx.planItems.filter((item) => item.dayNumber === day);
  }
  const date = dateForDay(ctx.startDate, day);
  if (!date) return [];
  return ctx.planItems.filter((item) => item.planDate === date);
}

/** Timed items only, sorted by hour, then minute, then `sortOrder`, then `id`
 * (`TripPlanSection.sortedTimedEntries`, :159-186). */
export function sortTimed(items: readonly PlanItemDto[]): PlanItemDto[] {
  return items
    .map((item) => ({ item, hm: parseHourMinute(item.startTime) }))
    .filter((x): x is { item: PlanItemDto; hm: { hour: number; minute: number } } => x.hm != null)
    .sort((a, b) => {
      if (a.hm.hour !== b.hm.hour) return a.hm.hour - b.hm.hour;
      if (a.hm.minute !== b.hm.minute) return a.hm.minute - b.hm.minute;
      if (a.item.sortOrder !== b.item.sortOrder) return a.item.sortOrder - b.item.sortOrder;
      return a.item.id - b.item.id;
    })
    .map((x) => x.item);
}

/** Display order for a day: timed items first (time/sortOrder/id), then
 * untimed items (sortOrder/id) so they still count as map pins
 * (`TripPlanSection.orderedDayItems`, :188-199). */
export function orderedDayItems(items: readonly PlanItemDto[]): PlanItemDto[] {
  const timed = sortTimed(items);
  const untimed = items
    .filter((item) => parseHourMinute(item.startTime) == null)
    .slice()
    .sort((a, b) => (a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.id - b.id));
  return [...timed, ...untimed];
}

export interface DayPin {
  id: number;
  index: number;
  title: string;
  latitude: number;
  longitude: number;
  subtitle: string | null;
  timeLabel: string | null;
}

/** Map pins for a day: `orderedDayItems` filtered to items with coordinates,
 * re-numbered 1-based after filtering (`TripPlanSection.dayMapPins`, :201-222). */
export function dayMapPins(items: readonly PlanItemDto[]): DayPin[] {
  const withCoords = orderedDayItems(items).filter(
    (item): item is PlanItemDto & { latitude: number; longitude: number } =>
      typeof item.latitude === 'number' && typeof item.longitude === 'number',
  );
  return withCoords.map((item, index) => {
    const hm = parseHourMinute(item.startTime);
    return {
      id: item.id,
      index: index + 1,
      title: item.title,
      latitude: item.latitude,
      longitude: item.longitude,
      subtitle: item.location ?? null,
      timeLabel: hm ? hhmm(hm.hour, hm.minute) : null,
    };
  });
}

function mapItemName(item: PlanItemDto): string {
  const location = (item.location ?? '').trim();
  return location.length > 0 ? location : item.title;
}

export interface TimelineEntry {
  item: PlanItemDto;
  timeLabel: string | null;
  distanceToNext: string | null;
  routeToNext: {
    from: LatLng;
    to: LatLng;
    fromName: string;
    toName: string;
    fromAddress: string | null;
    toAddress: string | null;
  } | null;
  isLast: boolean;
}

function itemLatLng(item: PlanItemDto): LatLng | null {
  return typeof item.latitude === 'number' && typeof item.longitude === 'number'
    ? { latitude: item.latitude, longitude: item.longitude }
    : null;
}

/** Rendered timeline entries (timed items only). `timeLabel` is hidden when
 * it's the same minute-of-day as the previous entry
 * (`TripPlanSection.renderedTimeline`/`distanceText`/`route`, :224-283). */
export function renderedTimeline(
  items: readonly PlanItemDto[],
  locale: 'en' | 'vi',
): TimelineEntry[] {
  const timed = sortTimed(items);
  return timed.map((item, index) => {
    const hm = parseHourMinute(item.startTime)!;
    const totalMinutes = hm.hour * 60 + hm.minute;
    const previous = index > 0 ? timed[index - 1]! : null;
    const previousMinutes = previous
      ? (() => {
          const prevHm = parseHourMinute(previous.startTime)!;
          return prevHm.hour * 60 + prevHm.minute;
        })()
      : null;
    const next = index < timed.length - 1 ? timed[index + 1]! : null;

    const currentLatLng = itemLatLng(item);
    const nextLatLng = next ? itemLatLng(next) : null;
    const distanceToNext =
      currentLatLng && nextLatLng
        ? formatDistanceKm(haversineMeters(currentLatLng, nextLatLng), locale)
        : null;
    const routeToNext =
      currentLatLng && nextLatLng
        ? {
            from: currentLatLng,
            to: nextLatLng,
            fromName: mapItemName(item),
            toName: mapItemName(next!),
            fromAddress: item.address?.trim() || null,
            toAddress: next!.address?.trim() || null,
          }
        : null;

    return {
      item,
      timeLabel: previousMinutes !== totalMinutes ? hhmm(hm.hour, hm.minute) : null,
      distanceToNext,
      routeToNext,
      isLast: next == null,
    };
  });
}

export type PlanOp =
  | { kind: 'patch'; id: number; body: UpdatePlanItemDto }
  | { kind: 'delete'; id: number }
  | { kind: 'tripDates'; startDate: string; endDate: string };

/** Ops to add a day. When the trip has scheduled dates, extends `endDate` by
 * one day; otherwise `[]` (the caller bumps its local day counter). Always
 * `[]` once `availableDays` reaches 14 (`TripDetailService.addPlanningDay`, :1473-1496). */
export function addDayOps(ctx: DayContext): PlanOp[] {
  if (!canAddDay(ctx)) return [];
  if (ctx.startDate && ctx.endDate && scheduledDayCount(ctx) != null) {
    return [
      { kind: 'tripDates', startDate: ctx.startDate, endDate: addDaysToDateString(ctx.endDate, 1) },
    ];
  }
  return [];
}

/** Ops to delete a day and shift subsequent days down by one. Guards on
 * `availableDays.length > 1` and `1 <= day <= count`
 * (`TripDetailService.deletePlanningDay`, :1501-1575, and
 * `.deletePlanItems(onDate:)`, :1753-1825). */
export function deleteDayOps(ctx: DayContext, day: number): PlanOp[] {
  const count = availableDays(ctx).length;
  if (count <= 1 || day < 1 || day > count) return [];

  if (ctx.isPlanningMode) {
    const toDelete = ctx.planItems.filter((item) => item.dayNumber === day);
    const toShift = ctx.planItems.filter(
      (item) => typeof item.dayNumber === 'number' && item.dayNumber > day,
    );
    const ops: PlanOp[] = [
      ...toDelete.map((item): PlanOp => ({ kind: 'delete', id: item.id })),
      ...toShift.map((item): PlanOp => ({
        kind: 'patch',
        id: item.id,
        body: { dayNumber: (item.dayNumber as number) - 1 },
      })),
    ];
    if (ctx.startDate && ctx.endDate && scheduledDayCount(ctx) != null) {
      ops.push({
        kind: 'tripDates',
        startDate: ctx.startDate,
        endDate: addDaysToDateString(ctx.endDate, -1),
      });
    }
    return ops;
  }

  const dateStr = dateForDay(ctx.startDate, day);
  if (!dateStr || !ctx.endDate) return [];
  const toDelete = ctx.planItems.filter((item) => item.planDate === dateStr);
  const toShift = ctx.planItems.filter((item) => !!item.planDate && item.planDate > dateStr);
  const ops: PlanOp[] = [
    ...toDelete.map((item): PlanOp => ({ kind: 'delete', id: item.id })),
    ...toShift.map((item): PlanOp => ({
      kind: 'patch',
      id: item.id,
      body: { planDate: addDaysToDateString(item.planDate as string, -1) },
    })),
    {
      kind: 'tripDates',
      startDate: ctx.startDate as string,
      endDate: addDaysToDateString(ctx.endDate, -1),
    },
  ];
  return ops;
}

/** Ops to reorder days: `orderedDays` is the current day-number order the
 * user dragged into place; slot `i` (0-based) maps to day number `i + 1`.
 * Planning mode patches `dayNumber` directly; date mode translates day
 * numbers to `planDate` strings first. Only changed items are patched; a
 * length mismatch against `availableDays` returns `[]`
 * (`TripDetailService.rearrangePlanningDays`/`rearrangePlanDates`, :1677-1751). */
export function rearrangeOps(ctx: DayContext, orderedDays: readonly number[]): PlanOp[] {
  const days = availableDays(ctx);
  if (orderedDays.length !== days.length) return [];

  if (ctx.isPlanningMode) {
    const mapping = new Map<number, number>();
    orderedDays.forEach((sourceDay, index) => mapping.set(sourceDay, index + 1));

    const ops: PlanOp[] = [];
    for (const item of ctx.planItems) {
      if (typeof item.dayNumber !== 'number') continue;
      const target = mapping.get(item.dayNumber);
      if (target != null && target !== item.dayNumber) {
        ops.push({ kind: 'patch', id: item.id, body: { dayNumber: target } });
      }
    }
    return ops;
  }

  if (!ctx.startDate) return [];
  const orderedDates = orderedDays.map((d) => dateForDay(ctx.startDate, d));
  const slotDates = days.map((d) => dateForDay(ctx.startDate, d));
  if (orderedDates.some((d) => d == null) || slotDates.some((d) => d == null)) return [];

  const mapping = new Map<string, string>();
  orderedDates.forEach((sourceDate, index) => {
    mapping.set(sourceDate as string, slotDates[index] as string);
  });

  const ops: PlanOp[] = [];
  for (const item of ctx.planItems) {
    if (!item.planDate) continue;
    const target = mapping.get(item.planDate);
    if (target != null && target !== item.planDate) {
      ops.push({ kind: 'patch', id: item.id, body: { planDate: target } });
    }
  }
  return ops;
}

/** Optimistic local projection of `ops` onto `items` (delete removes, patch
 * merges, `tripDates` is a no-op here — it targets the trip, not plan items). */
export function applyOpsLocally(
  items: readonly PlanItemDto[],
  ops: readonly PlanOp[],
): PlanItemDto[] {
  let result = items.slice();
  for (const op of ops) {
    if (op.kind === 'delete') {
      result = result.filter((item) => item.id !== op.id);
    } else if (op.kind === 'patch') {
      result = result.map((item) => (item.id === op.id ? { ...item, ...op.body } : item));
    }
  }
  return result;
}
