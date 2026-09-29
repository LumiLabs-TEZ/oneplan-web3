/**
 * Pure formatters for `LocationSearchResultDto` rows — port of
 * `TripLocationPickerSheet.swift:135-189` (title/subtitle) and
 * `CreateTripView.swift:289-291` (`selectedLocationText`, `cityId`/`stateId`/`countryId`).
 */
import type { components } from '@/api/schema';

type LocationSearchResultDto = components['schemas']['LocationSearchResultDto'];

export function locationTitle(result: LocationSearchResultDto): string {
  return result.city?.name ?? result.state.name;
}

export function locationSubtitle(result: LocationSearchResultDto): string {
  if (result.city) return `${result.state.name}, ${result.country.name}`;
  return result.country.name;
}

export function locationSelectionText(result: LocationSearchResultDto): string {
  return `${locationTitle(result)}, ${locationSubtitle(result)}`;
}

export function toTripLocationIds(result: LocationSearchResultDto): {
  cityId?: number;
  stateId?: number;
  countryId: number;
} {
  return {
    ...(result.city ? { cityId: result.city.id } : {}),
    stateId: result.state.id,
    countryId: result.country.id,
  };
}
