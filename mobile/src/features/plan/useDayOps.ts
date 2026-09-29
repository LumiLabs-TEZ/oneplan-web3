/**
 * Day-operation executor: turns `addDayOps`/`deleteDayOps`/`rearrangeOps` (`helpers/planDays.ts`)
 * into fired network calls, with an optimistic local cache update up front (there are no
 * reorder/day endpoints on the server — every op is an N x PATCH/DELETE, see constraints.md).
 *
 * Port of `TripDetailService.addPlanningDay`/`.deletePlanningDay`/`.rearrangePlanningDays`/
 * `.rearrangePlanDates` (`ios/OnePlan/OnePlan/Services/TripDetailService.swift:1473-1560,
 * 1677-1760`). The planning-trip-with-no-scheduled-dates day counter lives in the shared
 * `planningDayCountStore` (keyed by `tripId`, not this hook's caller) — the caller still owns
 * *mutating* it via the injected `bumpLocalDayCount` (typically `usePlanDay`'s, which wraps the
 * same store), but `deleteDay` also *reads* the store directly for its "only 1 day left" guard,
 * since `deleteDayOps`'s own item-derived count under-counts a trailing counter-mode day that has
 * no plan items on it yet. Mirrors iOS's `planningDayCount` counter vs. `trip.endDate` PATCH
 * branch.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { keys } from '@/api/keys';
import { deletePlanItem, invalidateTrip, updateTrip } from '@/features/trip/api/mutations';

import { invalidatePlanItems, updatePlanItem } from './api/mutations';
import {
  addDayOps,
  applyOpsLocally,
  availableDays,
  canAddDay,
  deleteDayOps,
  rearrangeOps,
  type DayContext,
  type PlanOp,
} from './helpers/planDays';
import { planningDayCountStore } from './planningDayCountStore';
import type { PlanItemDto } from './types';

/** Mirrors `MAX_PLANNING_DAYS` in `helpers/planDays.ts`/`usePlanDay.ts` (not exported there). */
const MAX_PLANNING_DAYS = 14;

export interface UseDayOpsOptions {
  /** Grows/shrinks the planning-trip-with-no-dates local day counter (`usePlanDay`). */
  bumpLocalDayCount: (delta: number) => void;
}

export interface UseDayOpsResult {
  /** Callers fire-and-forget (`void addDay(ctx)`); the returned promise exists so tests can
   * await settlement without racing `Promise.allSettled`/invalidation. */
  addDay: (ctx: DayContext) => Promise<void>;
  deleteDay: (ctx: DayContext, day: number) => Promise<void>;
  /** Fires only when `ops` is non-empty, i.e. the order actually changed something. */
  rearrange: (ctx: DayContext, orderedDays: readonly number[]) => Promise<void>;
  pending: boolean;
}

export function useDayOps(
  tripId: number,
  { bumpLocalDayCount }: UseDayOpsOptions,
  api: ApiClient = defaultApi,
): UseDayOpsResult {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [inFlight, setInFlight] = useState(0);

  const execOp = (op: PlanOp): Promise<unknown> => {
    if (op.kind === 'delete') return deletePlanItem(tripId, op.id, api);
    if (op.kind === 'patch') return updatePlanItem(tripId, op.id, op.body, api);
    return updateTrip(tripId, { startDate: op.startDate, endDate: op.endDate }, api);
  };

  const runOps = async (ops: readonly PlanOp[]): Promise<void> => {
    if (ops.length === 0) return;

    queryClient.setQueryData<PlanItemDto[]>(keys.trips.planItems(tripId), (current) =>
      current ? applyOpsLocally(current, ops) : current,
    );

    setInFlight((n) => n + 1);
    try {
      const results = await Promise.allSettled(ops.map(execOp));
      await Promise.all([
        invalidatePlanItems(queryClient, tripId),
        invalidateTrip(queryClient, tripId),
      ]);
      if (results.some((r) => r.status === 'rejected')) {
        Alert.alert(t('Something went wrong'));
      }
    } finally {
      setInFlight((n) => n - 1);
    }
  };

  const addDay = async (ctx: DayContext): Promise<void> => {
    // Same under-counting issue as `deleteDay`: in counter mode, `canAddDay(ctx)`/`addDayOps`
    // only see `ctx.planItems`-derived days, so a run of empty "+ add"s (no items ever placed on
    // the new days) would never hit the 14-day cap. Check the shared counter too.
    const isCounterMode = !ctx.startDate || !ctx.endDate;
    if (
      !canAddDay(ctx) ||
      (isCounterMode && planningDayCountStore.get(tripId) >= MAX_PLANNING_DAYS)
    ) {
      return;
    }
    const ops = addDayOps(ctx);
    if (ops.length === 0) {
      // Counter mode (no scheduled dates): no plan items exist on the new day yet, so there is
      // nothing to PATCH — just grow the shared counter that backs the chip strip.
      bumpLocalDayCount(1);
      return;
    }
    await runOps(ops);
  };

  const deleteDay = async (ctx: DayContext, day: number): Promise<void> => {
    const isCounterMode = !ctx.startDate || !ctx.endDate;
    // In counter mode `deleteDayOps`'s own item-derived count can under-count a trailing day
    // that has no plan items on it yet (e.g. "+ add" then immediately "Delete") — read the
    // shared counter instead so the "only 1 day left" guard sees the day the user actually sees.
    const count = isCounterMode ? planningDayCountStore.get(tripId) : availableDays(ctx).length;
    if (count <= 1 || day < 1 || day > count) return;

    const ops = deleteDayOps(ctx, day);
    const promise = ops.length > 0 ? runOps(ops) : Promise.resolve();
    // Counter mode: the deleted day was tracked only by the shared counter, not by dates — bump
    // it regardless of whether there were any plan items to delete/shift on the server.
    if (isCounterMode) bumpLocalDayCount(-1);
    await promise;
  };

  const rearrange = async (ctx: DayContext, orderedDays: readonly number[]): Promise<void> => {
    const ops = rearrangeOps(ctx, orderedDays);
    if (ops.length === 0) return;
    await runOps(ops);
  };

  return { addDay, deleteDay, rearrange, pending: inFlight > 0 };
}
