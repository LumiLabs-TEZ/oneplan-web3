/**
 * Plan-item detail, per-day route, location-plan-count and presigned-download-url queries.
 * List/create/update/delete of the plan-item collection lives on `features/trip` (`usePlanItems`,
 * `useDeletePlanItem`) since the trip owns that collection; this module covers the detail-level
 * reads consumed by later plan-item UI tasks.
 */
import { useQuery } from '@tanstack/react-query';

import { api as defaultApi, type ApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import { HttpError } from '@/features/trip/api/queries';

import type { LocationPlanCountDto, PlanItemDto, PlanRouteDto } from '../types';

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

function isValidId(id: number | null | undefined): id is number {
  return typeof id === 'number' && Number.isFinite(id) && id > 0;
}

// --- plain fetchers (prefetch / tests) --------------------------------------

export async function fetchPlanItem(
  tripId: number,
  id: number,
  api: ApiClient = defaultApi,
): Promise<PlanItemDto> {
  return unwrap(
    `GET /trips/${tripId}/plan-items/${id}`,
    await api.GET('/trips/{tripId}/plan-items/{id}', { params: { path: { tripId, id } } }),
  );
}

/**
 * Which day to route: `date` for scheduled trips (items keyed by `planDate`), `day` for
 * planning-mode trips (items keyed by `dayNumber`, no `planDate` yet).
 */
export type PlanRouteDay = { date: string } | { day: number };

export async function fetchPlanRoute(
  tripId: number,
  selector: PlanRouteDay,
  api: ApiClient = defaultApi,
): Promise<PlanRouteDto> {
  return unwrap(
    `GET /trips/${tripId}/plan-route`,
    await api.GET('/trips/{tripId}/plan-route', {
      params: { path: { tripId }, query: selector },
    }),
  );
}

export async function fetchLocationPlanCount(
  location: string,
  api: ApiClient = defaultApi,
): Promise<number> {
  const dto = unwrap<LocationPlanCountDto>(
    'GET /plan-items/stats/location-plan-count',
    await api.GET('/plan-items/stats/location-plan-count', {
      params: { query: { location } },
    }),
  );
  return dto.count;
}

export async function fetchDownloadUrl(
  objectKey: string,
  api: ApiClient = defaultApi,
): Promise<string> {
  const dto = unwrap(
    'GET /uploads/url',
    await api.GET('/uploads/url', { params: { query: { objectKey } } }),
  );
  return dto.url;
}

// --- hooks ------------------------------------------------------------------

/**
 * A single plan item. `initialData` lets a detail screen seed from the already-fetched list
 * (`usePlanItems`) so it renders instantly; `staleTime: 0` still lets a background refetch
 * correct it (e.g. after another member edits it).
 */
export function usePlanItem(
  tripId: number | null | undefined,
  id: number | null | undefined,
  opts: { initialData?: PlanItemDto } = {},
) {
  const enabled = isValidId(tripId) && isValidId(id);
  return useQuery({
    queryKey: keys.trips.planItem(enabled ? tripId : 0, enabled ? id : 0),
    queryFn: () => fetchPlanItem(tripId as number, id as number),
    initialData: opts.initialData,
    staleTime: 0,
    enabled,
    meta: { persist: false },
  });
}

/** Ordered map pins + driving legs for one day. Never persisted — always a fresh network read. */
export function usePlanRoute(tripId: number | null | undefined, selector: PlanRouteDay | null) {
  const enabled = isValidId(tripId) && selector != null;
  const id = enabled ? tripId : 0;
  return useQuery({
    queryKey:
      selector != null && 'day' in selector
        ? keys.trips.planRouteDay(id, selector.day)
        : keys.trips.planRoute(id, selector?.date ?? ''),
    queryFn: () => fetchPlanRoute(tripId as number, selector as PlanRouteDay),
    enabled,
    staleTime: 5 * 60_000,
    retry: 1,
    meta: { persist: false },
  });
}

/** How many times a location name has been added to any plan — backs the "popular" badge. */
export function useLocationPlanCount(location: string | null) {
  const trimmed = (location ?? '').trim();
  const enabled = trimmed.length > 0;
  return useQuery({
    queryKey: keys.planStats.locationCount(trimmed),
    queryFn: () => fetchLocationPlanCount(trimmed),
    enabled,
    staleTime: 10 * 60_000,
    meta: { persist: false },
  });
}

/**
 * Resolves an S3 object key to a presigned URL. Already-absolute URLs (legacy data, or a value
 * that's already a signed URL) skip the network call entirely.
 */
export function useDownloadUrl(objectKey: string | null) {
  const enabled = !!objectKey && !/^https?:/.test(objectKey);
  return useQuery({
    queryKey: keys.uploads.url(enabled ? (objectKey as string) : ''),
    queryFn: () => fetchDownloadUrl(objectKey as string),
    enabled,
    staleTime: 50 * 60_000,
    meta: { persist: false },
  });
}
