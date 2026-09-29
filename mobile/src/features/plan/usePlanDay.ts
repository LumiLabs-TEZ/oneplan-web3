/**
 * Owns the Plan tab's day-selection state: the day/date chip strip's
 * available days, the selected day, and the planning-mode local day counter.
 *
 * The local day counter exists because `availableDays` (`helpers/planDays.ts`)
 * derives the planning-mode day count from `max(dayNumber)` across plan items
 * (`planningDayCount`) — so a day added by the user before any plan item is
 * placed on it would otherwise disappear the moment `days` is recomputed.
 * The counter itself lives in `planningDayCountStore` (shared, keyed by
 * `tripId`) rather than local `useState`, so it stays in sync with the
 * create/edit plan-item form routes, which read/bump the same store — see
 * that file's header. `localDayCount` here is `max(planningDayCount(items),
 * store.get(tripId))`, and only ever grows; the chip strip's day count is
 * `max(scheduledOrPlanningCount, localDayCount)` whenever the trip has no
 * scheduled dates.
 *
 * State that derives from `planItems`/`trip`/`days` is adjusted during render
 * (the React-recommended "adjusting state when a prop changes" pattern —
 * https://react.dev/learn/you-might-not-need-an-effect) rather than in a
 * `useEffect`, since `react-hooks/set-state-in-effect` flags `setState` calls
 * inside effects as a cascading-render risk.
 *
 * Port of `TripPlanSection.selectInitialDay`/`.onChange(of: availableDayNumbers)`
 * (`ios/OnePlan/OnePlan/Component/Trip/TripPlanSection.swift:125-166`).
 */
import { useEffect, useMemo, useState } from 'react';

import type { TripDetail } from '@/features/trip/TripDetailContext';

import {
  availableDays,
  dateForDay,
  initialDay,
  planningDayCount,
  type DayContext,
} from './helpers/planDays';
import { planningDayCountStore, usePlanningDayCountStore } from './planningDayCountStore';

/** Mirrors `MAX_PLANNING_DAYS` in `helpers/planDays.ts` (not exported there). */
const MAX_PLANNING_DAYS = 14;

export interface UsePlanDayResult {
  ctx: DayContext;
  days: number[];
  selectedDay: number | null;
  setSelectedDay: (day: number) => void;
  dateForSelected: string | null;
  canAddDay: boolean;
  localDayCount: number;
  bumpLocalDayCount: (delta: number) => void;
}

export function usePlanDay(detail: TripDetail): UsePlanDayResult {
  const { tripId, trip, planItems } = detail;

  const ctx: DayContext = useMemo(
    () => ({
      isPlanningMode: trip?.status === 'PLANNING',
      startDate: trip?.startDate ?? null,
      endDate: trip?.endDate ?? null,
      planItems,
    }),
    [trip?.status, trip?.startDate, trip?.endDate, planItems],
  );

  // Reactive read of the shared store (bumping from another screen, e.g. a create/edit plan-item
  // form route reading/bumping the same `tripId`, re-renders this hook too).
  const storeCount = usePlanningDayCountStore((s) => s.get(tripId));

  // Synchronize the external store after commit. Writing it during render can notify another
  // mounted trip screen (for example after board generation) while this one is rendering.
  const itemDayCount = planningDayCount(planItems);
  useEffect(() => {
    planningDayCountStore.ensure(tripId, itemDayCount);
  }, [tripId, itemDayCount]);
  const localDayCount = Math.max(planningDayCount(planItems), storeCount);

  const bumpLocalDayCount = (delta: number) => {
    planningDayCountStore.bump(tripId, delta);
  };

  const hasScheduledDates = !!ctx.startDate && !!ctx.endDate;
  const days = useMemo(() => {
    const base = availableDays(ctx);
    if (hasScheduledDates) return base;
    const total = Math.max(base.length, localDayCount);
    return Array.from({ length: total }, (_, i) => i + 1);
  }, [ctx, hasScheduledDates, localDayCount]);

  // Picks the initial day once the trip has loaded; re-clamps onto the last available day
  // whenever `trip` or `days` changes out from under the current selection.
  const [seed, setSeed] = useState<{ trip: TripDetail['trip']; days: number[] } | null>(null);
  const [selectedDay, setSelectedDayState] = useState<number | null>(null);
  if (trip && (seed?.trip !== trip || seed?.days !== days)) {
    setSeed({ trip, days });
    setSelectedDayState((current) => {
      if (current == null) return initialDay(ctx, new Date(), trip.status);
      if (!days.includes(current)) return days[days.length - 1] ?? null;
      return current;
    });
  }

  const dateForSelected = selectedDay != null ? dateForDay(ctx.startDate, selectedDay) : null;

  return {
    ctx,
    days,
    selectedDay,
    setSelectedDay: setSelectedDayState,
    dateForSelected,
    canAddDay: days.length < MAX_PLANNING_DAYS,
    localDayCount,
    bumpLocalDayCount,
  };
}
