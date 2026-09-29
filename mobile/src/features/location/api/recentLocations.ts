/**
 * Recent locations — port of `RecentLocationService.swift`. `useRecentLocations` backs the
 * "recent" section of the location picker; `useSaveRecentLocation` fires a background save
 * whenever the user picks a place, deduping+unshifting the local cache exactly like
 * `RecentLocationService.saveRecent` (:47-48) so the UI updates before the network round-trip
 * even finishes.
 */
import { useCallback } from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api as defaultApi, type ApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import type { components } from '@/api/schema';
import { HttpError } from '@/features/trip/api/queries';

import type { LocationPick } from '../types';

export type RecentLocationDto = components['schemas']['RecentLocationDto'];
export type CreateRecentLocationDto = components['schemas']['CreateRecentLocationDto'];

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

export async function fetchRecentLocations(
  limit = 10,
  api: ApiClient = defaultApi,
): Promise<RecentLocationDto[]> {
  return unwrap(
    'GET /auth/me/recent-locations',
    await api.GET('/auth/me/recent-locations', { params: { query: { limit } } }),
  );
}

/** Never throws — a failed save is non-critical (mirrors the Swift `catch` that only logs). */
export async function saveRecentLocation(
  body: CreateRecentLocationDto,
  api: ApiClient = defaultApi,
): Promise<RecentLocationDto | null> {
  try {
    const { data, error, response } = await api.POST('/auth/me/recent-locations', { body });
    if (error || !response.ok || data === undefined) return null;
    return data;
  } catch {
    return null;
  }
}

/** `staleTime` 60s — the recent list changes rarely enough that repeated sheet opens shouldn't refetch. */
export function useRecentLocations(limit = 10) {
  return useQuery({
    queryKey: keys.recentLocations,
    queryFn: () => fetchRecentLocations(limit),
    staleTime: 60_000,
    meta: { persist: false },
  });
}

/** Server-side dedupe key mirrors the DB unique constraint (`RecentLocationService.saveRecent`). */
function sameNameAndAddress(a: RecentLocationDto, b: RecentLocationDto): boolean {
  return a.name === b.name && (a.address ?? null) === (b.address ?? null);
}

function pickToBody(pick: LocationPick): CreateRecentLocationDto {
  const body: CreateRecentLocationDto = { name: pick.name };
  if (pick.address != null) body.address = pick.address;
  if (pick.latitude != null) body.latitude = pick.latitude;
  if (pick.longitude != null) body.longitude = pick.longitude;
  if (pick.category != null) body.pointOfInterestCategory = pick.category;
  return body;
}

/**
 * Stable callback that fires the save without the caller awaiting it. On success, the returned
 * `RecentLocationDto` is deduped by name+address against the current cache and unshifted to the
 * front — the network response is not needed for the sheet to feel instant, only for the cache
 * to end up consistent with the server's `id`/`lastViewedAt`.
 */
export function useSaveRecentLocation(api: ApiClient = defaultApi): (pick: LocationPick) => void {
  const queryClient = useQueryClient();

  return useCallback(
    (pick: LocationPick) => {
      void saveRecentLocation(pickToBody(pick), api).then((saved) => {
        if (!saved) return;
        queryClient.setQueryData<RecentLocationDto[]>(keys.recentLocations, (current) => {
          const withoutDuplicate = (current ?? []).filter((r) => !sameNameAndAddress(r, saved));
          return [saved, ...withoutDuplicate];
        });
      });
    },
    [api, queryClient],
  );
}
