/**
 * Pure gating + request-body assembly for the "New trip" flow — port of
 * `CreateTripView.swift:317-349` (submit validation) and `TripService.canCreatePlanningTrip`
 * (`TripService.swift:19` free-tier cap, reused here as `FREE_PLANNING_TRIP_LIMIT`).
 */
import type { components } from '@/api/schema';
import { toTripLocationIds } from '@/features/location/helpers/locationLabel';
import { FREE_PLANNING_TRIP_LIMIT } from '@/features/shell/quickActions';

import { normalizeRange, toDateOnly, type DateRange } from './dateRange';

type LocationSearchResultDto = components['schemas']['LocationSearchResultDto'];
type CreateTripDto = components['schemas']['CreateTripDto'];

/** Free users may hold at most `FREE_PLANNING_TRIP_LIMIT` PLANNING trips. */
export function canCreatePlanningTrip(isPro: boolean, planningTripCount: number): boolean {
  return isPro || planningTripCount < FREE_PLANNING_TRIP_LIMIT;
}

/**
 * `null` when the trimmed name is empty or no location was picked (country is required, city
 * optional — `CreateTripView.swift:258`). Dates are only included once a duration was confirmed
 * at least once (`hasSelectedDuration`), as `yyyy-MM-dd` strings. `web3` is sent only when on, so
 * an ordinary trip's payload is unchanged.
 */
export function buildCreateTripBody(s: {
  name: string;
  location: LocationSearchResultDto | null;
  range: DateRange;
  hasSelectedDuration: boolean;
  web3?: boolean;
}): CreateTripDto | null {
  const name = s.name.trim();
  if (!name || !s.location) return null;

  const body: CreateTripDto = { name, ...toTripLocationIds(s.location) };

  if (s.hasSelectedDuration) {
    const normalized = normalizeRange(s.range);
    if (normalized) {
      body.startDate = toDateOnly(normalized.start);
      body.endDate = toDateOnly(normalized.end);
    }
  }

  if (s.web3) body.web3 = true;

  return body;
}
