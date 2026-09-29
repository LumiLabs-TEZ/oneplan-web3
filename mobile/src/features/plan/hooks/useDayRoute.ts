/**
 * Merges a day's map pins with the server-computed driving route
 * (`GET /trips/:tripId/plan-route`) into renderable polyline legs, falling
 * back to a straight line between consecutive pins when the server route is
 * missing, still loading, or its pins don't line up with ours (e.g. a pin was
 * added/removed/reordered after the route was fetched).
 */
import type { TFunction } from 'i18next';

import type { AppLanguage } from '@/stores/settingsStore';

import { usePlanRoute, type PlanRouteDay } from '../api/queries';
import { formatDistanceKm, haversineMeters, type LatLng } from '../helpers/geo';
import type { DayPin } from '../helpers/planDays';
import { decodePolyline } from '../helpers/polyline';
import type { PlanRouteDto, PlanRouteLegDto } from '../types';

export type LegMode = PlanRouteLegDto['mode'];

/** Mirrors the server's `WALK_MAX_STRAIGHT_KM` — used for the straight-line fallback. */
const WALK_MAX_STRAIGHT_M = 1000;

export interface DayRouteLeg {
  points: LatLng[];
  durationSec: number | null;
  distanceM: number | null;
  /** Walked (short hop) or driven — dashed vs solid on the map. */
  mode: LegMode;
  fromServer: boolean;
}

export interface DayRoute {
  pins: DayPin[];
  legs: DayRouteLeg[];
  hasServerLegs: boolean;
}

function straightLine(from: DayPin, to: DayPin): LatLng[] {
  return [
    { latitude: from.latitude, longitude: from.longitude },
    { latitude: to.latitude, longitude: to.longitude },
  ];
}

/**
 * Pure merge: when the server's `route.pins` are the same stops as `pins` in
 * the same order and `route.legs` lines up 1:1 with the gaps between them, each
 * leg decodes its polyline (or falls back to a straight line when the polyline
 * is missing, keeping the server's duration/distance). Any mismatch — no route,
 * still loading, different stops/order, or a leg count that doesn't match
 * `pins.length - 1` — falls back to a straight line for every pair with no
 * duration/distance, so a leg is never drawn between the wrong two stops.
 */
export function mergeLegs(pins: readonly DayPin[], route?: PlanRouteDto): DayRouteLeg[] {
  const pairCount = Math.max(pins.length - 1, 0);
  if (pairCount === 0) return [];

  const serverLegs = route?.legs;
  const samePins =
    route?.pins.length === pins.length && route.pins.every((p, i) => p.id === pins[i]!.id);
  const useServer = samePins && !!serverLegs && serverLegs.length === pairCount;

  return Array.from({ length: pairCount }, (_, i) => {
    const from = pins[i]!;
    const to = pins[i + 1]!;
    if (!useServer) {
      return {
        points: straightLine(from, to),
        durationSec: null,
        distanceM: null,
        mode: haversineMeters(from, to) < WALK_MAX_STRAIGHT_M ? 'walk' : 'drive',
        fromServer: false,
      };
    }
    const leg = serverLegs![i]!;
    return {
      points: leg.polyline ? decodePolyline(leg.polyline) : straightLine(from, to),
      durationSec: leg.durationSec ?? null,
      distanceM: leg.distanceM ?? null,
      mode: leg.mode,
      fromServer: true,
    };
  });
}

/** `"12 min · 3.4 km"` label for a leg, or `null` when duration/distance is missing. */
export function legInfoLabel(leg: DayRouteLeg, locale: AppLanguage, t: TFunction): string | null {
  if (leg.durationSec == null || leg.distanceM == null) return null;
  const minutes = Math.max(1, Math.round(leg.durationSec / 60));
  const distance = formatDistanceKm(leg.distanceM, locale);
  return t('%lld min · %@', { 0: minutes, 1: distance });
}

/** Ordered map pins + merged legs for one day, refreshed whenever the server route changes. */
export function useDayRoute(
  tripId: number | null | undefined,
  pins: readonly DayPin[],
  day: PlanRouteDay | null,
): DayRoute & { isLoading: boolean } {
  const route = usePlanRoute(tripId, day);
  const legs = mergeLegs(pins, route.data);
  return {
    pins: pins as DayPin[],
    legs,
    hasServerLegs: legs.some((leg) => leg.fromServer),
    isLoading: route.isLoading,
  };
}
