/**
 * Shrinking a trip's schedule drops the plan items that no longer have a day to live on —
 * port of `TripDetailService.planItemCount(beyondDay:)` as used by
 * `TripDetailView.handleTripDatesConfirmed` (`TripDetailView.swift:1167-1189`), except the
 * RN side returns the items themselves so the caller can DELETE each one.
 *
 * Items without a `dayNumber` are date-anchored (set after the trip started) and are never
 * considered lost.
 */
import type { PlanItemDto } from '../types';

export function lostPlanItems(
  planItems: readonly PlanItemDto[] | undefined,
  newDayCount: number,
): PlanItemDto[] {
  if (!planItems) return [];
  return planItems.filter((item) => item.dayNumber != null && item.dayNumber > newDayCount);
}
