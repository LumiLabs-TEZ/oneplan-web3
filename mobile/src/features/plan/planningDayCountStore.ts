/**
 * Shared planning-mode day counter, keyed by `tripId`.
 *
 * `availableDays`/`planningDayCount` (`helpers/planDays.ts`) derive the day count for a planning
 * trip with no scheduled dates from `max(dayNumber)` across plan items, so a day added by the
 * user before any plan item lands on it would otherwise disappear the moment the day list is
 * recomputed. iOS keeps a single `TripDetailService.planningDayCount` shared by every view that
 * edits the trip's schedule; RN's trip-detail screen (`usePlanDay`) and the create/edit plan-item
 * form routes (`plan/new.tsx`, `plan/[itemId]/edit.tsx`) are separate component trees with no
 * shared view-model instance, so the counter has to live in a store instead of local `useState` —
 * otherwise a day added from one screen would not be visible from another (e.g. add a day from
 * the Plan tab, then open "New Plan" and find the day missing).
 *
 * Not persisted: this is UI-session-only bookkeeping, not server state. `counts[tripId]` is
 * always `>= 1` — callers seed/raise the floor with `ensure` (e.g. from `planningDayCount(items)`
 * whenever a fresh fetch reveals a higher `dayNumber` than the counter has seen) and mutate it
 * with `bump` (`+1`/`-1` from add/delete-day flows).
 */
import { create } from 'zustand';

interface PlanningDayCountState {
  counts: Record<number, number>;
  get: (tripId: number) => number;
  bump: (tripId: number, delta: number) => void;
  ensure: (tripId: number, min: number) => void;
}

export const usePlanningDayCountStore = create<PlanningDayCountState>()((set, get) => ({
  counts: {},
  get: (tripId) => get().counts[tripId] ?? 1,
  bump: (tripId, delta) =>
    set((state) => ({
      counts: { ...state.counts, [tripId]: Math.max(1, (state.counts[tripId] ?? 1) + delta) },
    })),
  ensure: (tripId, min) =>
    set((state) => {
      const current = state.counts[tripId] ?? 1;
      if (current >= min) return state;
      return { counts: { ...state.counts, [tripId]: min } };
    }),
}));

/** Non-hook access for imperative call sites (mutation executors, screens outside a component). */
export const planningDayCountStore = {
  get: (tripId: number) => usePlanningDayCountStore.getState().get(tripId),
  bump: (tripId: number, delta: number) => usePlanningDayCountStore.getState().bump(tripId, delta),
  ensure: (tripId: number, min: number) => usePlanningDayCountStore.getState().ensure(tripId, min),
};
