/**
 * Foursquare Places API search-data layer. Port of the Android
 * `feature/location/data/FoursquareClient.kt` (New Places API, not the deprecated legacy v3).
 * Uses the global `fetch` directly (injectable `fetchFn` for tests) — this is a third-party
 * host, so it deliberately does NOT route through `src/api/client.ts`'s openapi-fetch client.
 */
import { haversineMeters, type LatLng } from '@/features/plan/helpers/geo';
import { env } from '@/lib/env';

import type { PlacePrediction, PlaceSearchProvider } from './placeSearch';

const PLACES_BASE_URL = 'https://places-api.foursquare.com';
const API_VERSION = '2025-06-17';
const FIELDS = 'fsq_place_id,name,latitude,longitude,location,categories';
const ATTRIBUTION = 'Powered by Foursquare';

interface FoursquareLocation {
  formatted_address?: string;
  address?: string;
  locality?: string;
}

interface FoursquareCategory {
  name?: string;
}

interface FoursquarePlace {
  fsq_place_id?: string;
  name?: string;
  latitude?: number;
  longitude?: number;
  location?: FoursquareLocation;
  categories?: FoursquareCategory[];
}

interface FoursquareSearchResponse {
  results?: FoursquarePlace[];
}

function joinAddressLocality(location: FoursquareLocation | undefined): string | null {
  const parts = [location?.address, location?.locality].filter(
    (p): p is string => !!p && p.trim() !== '',
  );
  return parts.length > 0 ? parts.join(', ') : null;
}

function toPrediction(place: FoursquarePlace): PlacePrediction | null {
  const name = place.name?.trim();
  if (!name) return null;
  const { latitude, longitude } = place;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const address = place.location?.formatted_address ?? joinAddressLocality(place.location);
  const category = place.categories?.[0]?.name ?? null;

  return {
    placeId: `fsq:${place.fsq_place_id ?? ''}`,
    name,
    address: address ?? null,
    latitude: latitude as number,
    longitude: longitude as number,
    category,
  };
}

function llParam(bias: LatLng): string {
  return `${bias.latitude},${bias.longitude}`;
}

export interface CreateFoursquareProviderOpts {
  /** Defaults to `env.foursquareApiKey`. */
  apiKey?: string | null;
  fetchFn?: typeof fetch;
  /** Defaults to `console.warn`. Called at most once per provider instance. */
  log?: (message: string) => void;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

export function createFoursquareProvider(
  opts: CreateFoursquareProviderOpts = {},
): PlaceSearchProvider {
  const apiKey = opts.apiKey !== undefined ? opts.apiKey : env.foursquareApiKey;
  const fetchFn = opts.fetchFn ?? fetch;
  const log = opts.log ?? ((message: string) => console.warn(message));
  let warnedMissingKey = false;

  function warnMissingKeyOnce(): void {
    if (warnedMissingKey) return;
    warnedMissingKey = true;
    log('[foursquare] no API key configured — place search disabled');
  }

  async function fetchPlaces(
    url: URL,
    signal: AbortSignal | undefined,
  ): Promise<PlacePrediction[]> {
    try {
      const response = await fetchFn(url.toString(), {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'X-Places-Api-Version': API_VERSION,
          Accept: 'application/json',
        },
        signal,
      });
      if (!response.ok) return [];
      const body = (await response.json()) as FoursquareSearchResponse;
      const results = body.results ?? [];
      return results.map(toPrediction).filter((p): p is PlacePrediction => p !== null);
    } catch (err) {
      if (isAbortError(err)) return [];
      return [];
    }
  }

  return {
    name: 'foursquare',
    attribution: ATTRIBUTION,

    async search(query, bias, signal) {
      if (!apiKey) {
        warnMissingKeyOnce();
        return [];
      }
      const url = new URL(`${PLACES_BASE_URL}/places/search`);
      url.searchParams.set('query', query);
      url.searchParams.set('fields', FIELDS);
      url.searchParams.set('limit', '10');
      if (bias) url.searchParams.set('ll', llParam(bias));
      return fetchPlaces(url, signal);
    },

    async searchNearby(categoryIds, bias, limit, signal) {
      if (!apiKey) {
        warnMissingKeyOnce();
        return [];
      }
      const url = new URL(`${PLACES_BASE_URL}/places/search`);
      url.searchParams.set('fsq_category_ids', categoryIds.join(','));
      url.searchParams.set('ll', llParam(bias));
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('sort', 'DISTANCE');
      url.searchParams.set('fields', FIELDS);
      const results = await fetchPlaces(url, signal);
      return [...results]
        .sort((a, b) => haversineMeters(bias, a) - haversineMeters(bias, b))
        .slice(0, limit);
    },
  };
}
