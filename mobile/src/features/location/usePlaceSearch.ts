/**
 * Place-search + suggested-nearby queries backing the location-picker search sheet
 * (`LocationSheet`'s search content). Debounces the raw query 300 ms (`useDebouncedValue`),
 * gates the network call on >= 2 chars, and lets TanStack Query cancel the in-flight request
 * (via the `AbortSignal` `queryFn` receives) whenever the debounced query/bias changes.
 *
 * `provider` is injectable (defaults to the process-wide `placeSearchProvider()`) so tests can
 * swap in a fake without touching the Foursquare singleton.
 */
import { useQuery } from '@tanstack/react-query';

import { keys } from '@/api/keys';
import type { LatLng } from '@/features/plan/helpers/geo';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import {
  NEARBY_CATEGORIES,
  placeSearchProvider,
  type PlacePrediction,
  type PlaceSearchProvider,
} from '@/native/maps/placeSearch';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
const SUGGESTED_LIMIT = 10;
const STALE_TIME_MS = 5 * 60_000;

const SUGGESTED_CATEGORY_IDS = [
  NEARBY_CATEGORIES.restaurants,
  NEARBY_CATEGORIES.coffee,
  NEARBY_CATEGORIES.attractions,
];

/** `"lat,lng"` rounded to 3dp, or `null` — the bias-key contract documented on `keys.places`. */
export function biasKey(bias: LatLng | null): string | null {
  if (!bias) return null;
  return `${bias.latitude.toFixed(3)},${bias.longitude.toFixed(3)}`;
}

export interface UsePlaceSearchResult {
  results: PlacePrediction[];
  loading: boolean;
  /** `true` while the (debounced) query is non-empty but under `MIN_QUERY_LENGTH`. */
  tooShort: boolean;
}

export function usePlaceSearch(
  query: string,
  bias: LatLng | null,
  provider: PlaceSearchProvider = placeSearchProvider(),
): UsePlaceSearchResult {
  const debounced = useDebouncedValue(query, DEBOUNCE_MS);
  const trimmed = debounced.trim();
  const enabled = trimmed.length >= MIN_QUERY_LENGTH;
  const tooShort = trimmed.length > 0 && !enabled;

  const { data, isFetching } = useQuery({
    queryKey: keys.places.search(trimmed, biasKey(bias)),
    queryFn: ({ signal }) => provider.search(trimmed, bias, signal),
    enabled,
    staleTime: STALE_TIME_MS,
    meta: { persist: false },
  });

  return {
    results: enabled ? (data ?? []) : [],
    loading: enabled && isFetching,
    tooShort,
  };
}

/** Restaurants + coffee + attractions nearby the given bias, limited to 10. `[]` until a user
 * coordinate exists — the caller (`LocationSheet`) only shows the strip once `bias` is set. */
export function useSuggestedNearby(
  bias: LatLng | null,
  provider: PlaceSearchProvider = placeSearchProvider(),
): PlacePrediction[] {
  const key = biasKey(bias);
  const { data } = useQuery({
    queryKey: keys.places.nearby(key ?? ''),
    queryFn: ({ signal }) =>
      provider.searchNearby(SUGGESTED_CATEGORY_IDS, bias as LatLng, SUGGESTED_LIMIT, signal),
    enabled: bias != null,
    staleTime: STALE_TIME_MS,
    meta: { persist: false },
  });
  return data ?? [];
}
