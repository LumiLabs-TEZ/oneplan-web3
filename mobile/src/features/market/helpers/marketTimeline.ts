import { parseHourMinute } from '@/features/plan/helpers/planDays';

import type { MarketItem } from '../api/queries';

export interface MarketTimelineRow {
  /** `null` for the trailing group of items without a valid `startTime`. */
  hour: number | null;
  items: MarketItem[];
}

/**
 * One day of `MarketPlanSection` (`MarketPlanSection.swift:418-475`): items bucketed by start
 * hour, sorted by hour, minute, sortOrder, id. iOS silently drops untimed items; here they
 * trail the timeline in an unlabeled row so the "N activities" count stays truthful.
 */
export function marketTimeline(items: readonly MarketItem[], day: number): MarketTimelineRow[] {
  const timed: { item: MarketItem; hour: number; minute: number }[] = [];
  const untimed: MarketItem[] = [];
  for (const item of items) {
    if (item.dayNumber !== day) continue;
    const time = parseHourMinute(item.startTime);
    if (time) timed.push({ item, ...time });
    else untimed.push(item);
  }
  timed.sort(
    (a, b) =>
      a.hour - b.hour ||
      a.minute - b.minute ||
      a.item.sortOrder - b.item.sortOrder ||
      a.item.id - b.item.id,
  );
  const rows: MarketTimelineRow[] = [];
  for (const { item, hour } of timed) {
    const last = rows[rows.length - 1];
    if (last?.hour === hour) last.items.push(item);
    else rows.push({ hour, items: [item] });
  }
  if (untimed.length > 0) {
    untimed.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    rows.push({ hour: null, items: untimed });
  }
  return rows;
}

/** `MarketplaceRatingFormatter` (`MarketplaceItem.swift:71`). */
export function ratingLabel(
  averageRating: string | null | undefined,
  ratingCount: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const average = Number(averageRating);
  if (!ratingCount || !averageRating || !Number.isFinite(average)) return t('No ratings yet');
  const count =
    ratingCount >= 10_000
      ? t('10K+ ratings')
      : ratingCount >= 1_000
        ? t('1K+ ratings')
        : t('%lld ratings', { count: ratingCount });
  return `${average.toFixed(1)} · ${count}`;
}

/** iOS shows the "Updated …" caption only when rated and edited >60s after creation. */
export function showUpdatedCaption(createdAt: string, updatedAt: string, ratingCount: number) {
  return ratingCount > 0 && Date.parse(updatedAt) - Date.parse(createdAt) > 60_000;
}
