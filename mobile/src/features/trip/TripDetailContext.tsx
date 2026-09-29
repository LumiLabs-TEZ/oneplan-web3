/**
 * Per-trip data + access flags shared by the trip detail screen and its expense routes.
 * Replaces the shared `TripDetailService` (iOS) with tripId-keyed queries.
 *
 * The context carries only the stable core (trip, members, access, offline state). The heavier
 * slices are opt-in hooks — `useTripExpenses`, `useTripBudgets`, `useTripBreakdown`,
 * `useTripPlanItems` — that read `tripId`/`persist` from the core and subscribe to their own
 * query (TanStack dedupes the observers), so a screen re-renders only for the data it reads.
 * `useTripDetail()` assembles everything for the screens that need it all (trip detail, recap).
 */
import { useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext } from 'react';

import { keys } from '@/api/keys';
import type { PlanItemDto } from '@/features/plan/types';
import {
  useBreakdown,
  useBudgets,
  useExpenses,
  usePlanItems,
  useTrip,
} from '@/features/trip/api/queries';
import { tripAccess, type TripAccess } from '@/features/trip/helpers/tripAccess';
import { type Currency, fallbackCurrency } from '@/lib/currency';
import { isServingCached, useIsOnline } from '@/offline/servingCached';
import { useTripRoom } from '@/realtime/useTripRoom';

import type {
  BudgetDto,
  ExpenseSummaryDto,
  TripBreakdownDto,
  TripDto,
  TripMemberDto,
} from './types';

export interface TripCore {
  tripId: number;
  /** Only the ongoing trip persists to MMKV (iOS `OngoingTripCache`); the slice hooks pass it on. */
  persist: boolean;
  trip: TripDto | undefined;
  members: TripMemberDto[];
  homeCurrency: Currency;
  access: TripAccess;
  online: boolean;
  servingCached: boolean;
  cachedAt: number | null;
  isLoading: boolean;
  error: unknown;
  /** Invalidates the trip and every per-trip slice (keys are nested under `detail`). */
  refetchAll: () => Promise<unknown>;
}

export interface TripDetail extends Omit<TripCore, 'persist'> {
  budgets: BudgetDto[];
  expenses: ExpenseSummaryDto[];
  breakdown: TripBreakdownDto | undefined;
  planItems: PlanItemDto[];
  expensesLoading: boolean;
  planItemsLoading: boolean;
}

const Ctx = createContext<TripCore | null>(null);

export function TripDetailProvider({
  tripId,
  isOngoing,
  children,
}: {
  tripId: number;
  /** Only the ongoing trip persists to MMKV (iOS `OngoingTripCache`). */
  isOngoing: boolean;
  children: ReactNode;
}) {
  const trip = useTrip(tripId, { persist: isOngoing });
  const online = useIsOnline();
  const queryClient = useQueryClient();

  // Server pushes settlement/ended/deleted updates to members of this room.
  useTripRoom(tripId);

  const servingCached = isServingCached(trip, online);
  const access = tripAccess({ status: trip.data?.status, online, servingCached });

  const value: TripCore = {
    tripId,
    persist: isOngoing,
    trip: trip.data,
    members: trip.data?.members ?? [],
    homeCurrency: fallbackCurrency(trip.data?.currency),
    access,
    online,
    servingCached,
    cachedAt: servingCached && trip.dataUpdatedAt > 0 ? trip.dataUpdatedAt : null,
    isLoading: trip.isPending && !trip.data,
    error: trip.error,
    refetchAll: () => queryClient.invalidateQueries({ queryKey: keys.trips.detail(tripId) }),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Trip, members, currency, access and offline state — no per-trip lists. */
export function useTripCore(): TripCore {
  const v = useContext(Ctx);
  if (!v) throw new Error('Trip detail hooks must be used inside TripDetailProvider');
  return v;
}

export function useTripExpenses(): { expenses: ExpenseSummaryDto[]; expensesLoading: boolean } {
  const { tripId, persist } = useTripCore();
  const expenses = useExpenses(tripId, { persist });
  return {
    expenses: expenses.data ?? EMPTY,
    expensesLoading: expenses.isPending && !expenses.data,
  };
}

export function useTripBudgets(): BudgetDto[] {
  const { tripId, persist } = useTripCore();
  return useBudgets(tripId, { persist }).data ?? EMPTY;
}

export function useTripBreakdown(): TripBreakdownDto | undefined {
  const { tripId, persist } = useTripCore();
  return useBreakdown(tripId, { persist }).data;
}

export function useTripPlanItems(): { planItems: PlanItemDto[]; planItemsLoading: boolean } {
  const { tripId, persist } = useTripCore();
  const planItems = usePlanItems(tripId, { persist });
  return {
    planItems: planItems.data ?? EMPTY,
    planItemsLoading: planItems.isPending && !planItems.data,
  };
}

/** Everything at once — for the trip detail screen and the trip-end recap. */
export function useTripDetail(): TripDetail {
  const { persist: _persist, ...core } = useTripCore();
  const budgets = useTripBudgets();
  const { expenses, expensesLoading } = useTripExpenses();
  const breakdown = useTripBreakdown();
  const { planItems, planItemsLoading } = useTripPlanItems();
  return {
    ...core,
    budgets,
    expenses,
    breakdown,
    planItems,
    expensesLoading,
    planItemsLoading,
  };
}

/** Shared fallback so an absent list keeps one identity across renders. */
const EMPTY: never[] = [];
