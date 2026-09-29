/**
 * Location search — port of `LocationPickerService.swift`. `useLocationSearch` backs the
 * search results in `TripLocationPickerSheet.swift`; `useSuggestedCities` backs the
 * "no query yet" suggested list (`fetchSuggestedLocationResults`).
 */
import { useQuery } from '@tanstack/react-query';

import { api as defaultApi, type ApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import type { components } from '@/api/schema';
import { HttpError } from '@/features/trip/api/queries';

export type LocationSearchResultDto = components['schemas']['LocationSearchResultDto'];

/** Curated suggested-cities list, order preserved (`LocationPickerService.suggestedCityNames`). */
export const SUGGESTED_CITIES = [
  'Tokyo',
  'Paris',
  'New York',
  'London',
  'Singapore',
  'Bangkok',
  'Seoul',
  'Rome',
  'Ho Chi Minh',
  'Da Nang',
] as const;

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

export async function fetchLocationSearch(
  query: string,
  take: number,
  api: ApiClient = defaultApi,
): Promise<LocationSearchResultDto[]> {
  return unwrap(
    'GET /locations/search',
    await api.GET('/locations/search', { params: { query: { search: query, take } } }),
  );
}

/** `enabled` requires ≥2 trimmed chars — the server's `search` query param has `minLength: 2`. */
export function useLocationSearch(query: string) {
  const trimmed = query.trim();
  const enabled = trimmed.length >= 2;
  return useQuery({
    queryKey: keys.locations.search(trimmed),
    queryFn: () => fetchLocationSearch(trimmed, 50),
    enabled,
    staleTime: 5 * 60_000,
    meta: { persist: false },
  });
}

/** One de-duped result per curated city name, order preserved, never persisted/refetched. */
export function useSuggestedCities() {
  return useQuery({
    queryKey: keys.locations.search('__suggested__'),
    queryFn: async () => {
      const results = await Promise.all(
        SUGGESTED_CITIES.map((name) => fetchLocationSearch(name, 1)),
      );
      const seen = new Set<number>();
      const deduped: LocationSearchResultDto[] = [];
      for (const [index, result] of results.entries()) {
        const match = result[0];
        if (!match) continue;
        const dedupeKey = match.city?.id ?? -(index + 1);
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        deduped.push(match);
      }
      return deduped;
    },
    staleTime: Infinity,
    meta: { persist: false },
  });
}
