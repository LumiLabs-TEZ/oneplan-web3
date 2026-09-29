import { useQuery } from '@tanstack/react-query';

import { api as defaultApi, type ApiClient } from '@/api/client';
import { classifyError, type ClassifiedError } from '@/api/errors';
import { keys } from '@/api/keys';
import { persistOptions } from '@/offline/persister';

import type {
  BudgetDto,
  ExpenseDto,
  ExpenseSummaryDto,
  PlanItemDto,
  TripBreakdownDto,
  TripDto,
  TripSummaryDto,
} from '../types';

/**
 * Non-2xx result of an openapi-fetch call. Carries the status + parsed body so
 * `classifyQueryError` can hand them to `classifyError(body, { status })`.
 * Genuine network failures (offline) are thrown by fetch itself as `TypeError`
 * and reach TanStack Query untouched, so `classifyError(err).kind === 'offline'`
 * keeps working for the offline banner.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(label: string, status: number, body: unknown) {
    super(`${label} ${status}: ${JSON.stringify(body)}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

/** `classifyError` that understands `HttpError` thrown by the fetchers below. */
export function classifyQueryError(error: unknown): ClassifiedError {
  if (error instanceof HttpError) return classifyError(error.body, { status: error.status });
  return classifyError(error);
}

interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

function unwrap<T>(label: string, result: FetchResult<T>): T {
  const { data, error, response } = result;
  if (error !== undefined || !response.ok || data === undefined) {
    throw new HttpError(label, response.status, error ?? null);
  }
  return data;
}

export type PersistOpts = { persist?: boolean };

function isValidId(id: number | null | undefined): id is number {
  return typeof id === 'number' && Number.isFinite(id) && id > 0;
}

// --- plain fetchers (prefetch / tests) --------------------------------------

/** One `GET /trips` with no status filter — all statuses in a single call, like iOS. */
export async function fetchTrips(api: ApiClient = defaultApi): Promise<TripSummaryDto[]> {
  return unwrap('GET /trips', await api.GET('/trips'));
}

export async function fetchTrip(tripId: number, api: ApiClient = defaultApi): Promise<TripDto> {
  return unwrap(
    `GET /trips/${tripId}`,
    await api.GET('/trips/{id}', { params: { path: { id: tripId } } }),
  );
}

export async function fetchBudgets(
  tripId: number,
  api: ApiClient = defaultApi,
): Promise<BudgetDto[]> {
  return unwrap(
    `GET /trips/${tripId}/budgets`,
    await api.GET('/trips/{tripId}/budgets', { params: { path: { tripId } } }),
  );
}

export async function fetchExpenses(
  tripId: number,
  api: ApiClient = defaultApi,
): Promise<ExpenseSummaryDto[]> {
  return unwrap(
    `GET /trips/${tripId}/expenses`,
    await api.GET('/trips/{tripId}/expenses', { params: { path: { tripId } } }),
  );
}

export async function fetchBreakdown(
  tripId: number,
  api: ApiClient = defaultApi,
): Promise<TripBreakdownDto> {
  return unwrap(
    `GET /trips/${tripId}/expenses/breakdown`,
    await api.GET('/trips/{tripId}/expenses/breakdown', { params: { path: { tripId } } }),
  );
}

export async function fetchPlanItems(
  tripId: number,
  api: ApiClient = defaultApi,
): Promise<PlanItemDto[]> {
  return unwrap(
    `GET /trips/${tripId}/plan-items`,
    await api.GET('/trips/{tripId}/plan-items', { params: { path: { tripId } } }),
  );
}

export async function fetchExpenseDetail(
  tripId: number,
  expenseId: number,
  api: ApiClient = defaultApi,
): Promise<ExpenseDto> {
  return unwrap(
    `GET /trips/${tripId}/expenses/${expenseId}`,
    await api.GET('/trips/{tripId}/expenses/{id}', {
      params: { path: { tripId, id: expenseId } },
    }),
  );
}

// --- hooks ------------------------------------------------------------------

/**
 * All of the user's trips (every status) in one call. Always persisted: the
 * ongoing card on Home must render offline (iOS `OngoingTripCache.saveSummary`).
 */
export function useTrips() {
  return useQuery({
    queryKey: keys.trips.list(),
    queryFn: () => fetchTrips(),
    ...persistOptions(true),
    staleTime: 30_000,
  });
}

/**
 * Per-trip resources. `opts.persist` defaults to false; screens pass
 * `persist: isOngoing` so only the ongoing trip's slices survive a cold start
 * (replaces the `OngoingTripCache.swift` trip/budgets/expenses/planItems slices).
 */
export function useTrip(tripId: number | null | undefined, opts: PersistOpts = {}) {
  const enabled = isValidId(tripId);
  return useQuery({
    queryKey: keys.trips.detail(enabled ? tripId : 0),
    queryFn: () => fetchTrip(tripId as number),
    ...persistOptions(opts.persist ?? false),
    enabled,
  });
}

export function useBudgets(tripId: number | null | undefined, opts: PersistOpts = {}) {
  const enabled = isValidId(tripId);
  return useQuery({
    queryKey: keys.trips.budgets(enabled ? tripId : 0),
    queryFn: () => fetchBudgets(tripId as number),
    ...persistOptions(opts.persist ?? false),
    enabled,
  });
}

export function useExpenses(tripId: number | null | undefined, opts: PersistOpts = {}) {
  const enabled = isValidId(tripId);
  return useQuery({
    queryKey: keys.trips.expenses(enabled ? tripId : 0),
    queryFn: () => fetchExpenses(tripId as number),
    ...persistOptions(opts.persist ?? false),
    enabled,
  });
}

export function useBreakdown(tripId: number | null | undefined, opts: PersistOpts = {}) {
  const enabled = isValidId(tripId);
  return useQuery({
    queryKey: keys.trips.breakdown(enabled ? tripId : 0),
    queryFn: () => fetchBreakdown(tripId as number),
    ...persistOptions(opts.persist ?? false),
    enabled,
  });
}

export function usePlanItems(tripId: number | null | undefined, opts: PersistOpts = {}) {
  const enabled = isValidId(tripId);
  return useQuery({
    queryKey: keys.trips.planItems(enabled ? tripId : 0),
    queryFn: () => fetchPlanItems(tripId as number),
    ...persistOptions(opts.persist ?? false),
    enabled,
  });
}

/** Full expense (`ExpenseDto` with shares/note/currency). Never persisted — iOS never caches detail. */
export function useExpenseDetail(
  tripId: number | null | undefined,
  expenseId: number | null | undefined,
) {
  const enabled = isValidId(tripId) && isValidId(expenseId);
  return useQuery({
    queryKey: keys.trips.expenseDetail(enabled ? tripId : 0, enabled ? expenseId : 0),
    queryFn: () => fetchExpenseDetail(tripId as number, expenseId as number),
    meta: { persist: false },
    enabled,
  });
}
