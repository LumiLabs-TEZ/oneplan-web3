/**
 * Place-search abstraction — the search-data layer swap point (`FoursquareLocationProvider`
 * vs. a future Photon/OSM backend, mirrors the Android `LocationSearchProvider` split). Screens
 * depend only on this interface; `placeSearchProvider()` resolves the concrete implementation
 * from `env.foursquareApiKey`.
 */
import { createFoursquareProvider } from './foursquare';

export interface PlacePrediction {
  /** `"fsq:<fsq_place_id>"` for Foursquare results. */
  placeId: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  category: string | null;
}

export interface PlaceSearchProvider {
  name: 'foursquare' | 'photon';
  /** Attribution string to render alongside results, or `null` when not required. */
  attribution: string | null;
  search(
    query: string,
    bias?: { latitude: number; longitude: number } | null,
    signal?: AbortSignal,
  ): Promise<PlacePrediction[]>;
  searchNearby(
    categoryIds: readonly string[],
    bias: { latitude: number; longitude: number },
    limit: number,
    signal?: AbortSignal,
  ): Promise<PlacePrediction[]>;
}

/** Foursquare category ids for the "nearby" quick-pick chips (`ChooseLocationView` parity). */
export const NEARBY_CATEGORIES = {
  restaurants: '4d4b7105d754a06374d81259',
  coffee: '13035',
  lodging: '63be6904847c3692a84b9c25',
  attractions: '5109983191d435c0d71c2bb1',
} as const;

let singleton: PlaceSearchProvider | null = null;

/**
 * Process-wide place-search provider singleton. Currently always Foursquare
 * (`env.foursquareApiKey`, `null` when unset — the provider then degrades to
 * returning `[]` from every call rather than throwing).
 */
export function placeSearchProvider(): PlaceSearchProvider {
  if (!singleton) {
    singleton = createFoursquareProvider();
  }
  return singleton;
}
