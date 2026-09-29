/**
 * Pure walking/driving directions model between the user and a place. Ports
 * `LocationDetailView.directionsCameraPosition` (camera framing,
 * `ios/OnePlan/OnePlan/View/LocationDetailView.swift:1219-1249`,
 * `shouldAnimateDirectionsFly:1183-1186`) and `estimatedTravelMinutes`
 * (`:1296-1300`) onto the shared geo helpers (`../plan/helpers/geo`).
 */
import type { TFunction } from 'i18next';

import {
  estimateMinutes,
  formatDistanceKm,
  haversineMeters,
  quadraticBezier,
  type LatLng,
  type TransportMode,
} from '@/features/plan/helpers/geo';
import type { AppLanguage } from '@/stores/settingsStore';

export interface DirectionsModel {
  points: LatLng[];
  distanceM: number;
  minutes: number;
  /** `"12 min · 4.2 km"` */
  label: string;
  /** `max(separationMeters * 5, 1500)` — camera distance for the midpoint framing. */
  cameraDistanceM: number;
  /** `true` once the straight-line separation exceeds 30 km — the fly-to
   * camera move should snap instead of animate. */
  flySnap: boolean;
}

const CAMERA_DISTANCE_FACTOR = 5;
const CAMERA_DISTANCE_FLOOR_M = 1500;
const FLY_SNAP_THRESHOLD_M = 30_000;

/** `null` when either coordinate is missing (no user fix yet, or no place). */
export function directionsModel(
  user: LatLng | null,
  place: LatLng | null,
  mode: TransportMode,
  locale: AppLanguage,
  t: TFunction,
): DirectionsModel | null {
  if (!user || !place) return null;

  const distanceM = haversineMeters(user, place);
  const minutes = estimateMinutes(distanceM, mode);
  const label = t('%lld min · %@', { 0: minutes, 1: formatDistanceKm(distanceM, locale) });

  return {
    points: quadraticBezier(user, place),
    distanceM,
    minutes,
    label,
    cameraDistanceM: Math.max(distanceM * CAMERA_DISTANCE_FACTOR, CAMERA_DISTANCE_FLOOR_M),
    flySnap: distanceM > FLY_SNAP_THRESHOLD_M,
  };
}

/** Web-Mercator ground resolution at zoom 0 on the equator, in metres per point (256pt tiles). */
const METERS_PER_POINT_Z0 = 156_543.03392;
/** iOS assumes MapKit's ~30° vertical FOV when sizing `cameraDistance` (`:1236-1240`). */
const VERTICAL_FOV_RAD = (30 * Math.PI) / 180;

/**
 * iOS `directionsCameraPosition`: a flat, north-up camera on the user↔place midpoint, seen from
 * `cameraDistanceM`. Google's camera is zoom-driven, so the distance is converted to the zoom
 * whose vertical ground span matches what that distance covers at a 30° FOV.
 */
export function directionsCamera(
  user: LatLng,
  place: LatLng,
  cameraDistanceM: number,
  mapHeightPt: number,
): { center: LatLng; heading: 0; pitch: 0; zoom: number } {
  const center = {
    latitude: (user.latitude + place.latitude) / 2,
    longitude: (user.longitude + place.longitude) / 2,
  };
  const visibleMeters = 2 * cameraDistanceM * Math.tan(VERTICAL_FOV_RAD / 2);
  const cosLat = Math.cos((center.latitude * Math.PI) / 180);
  const zoom = Math.log2((METERS_PER_POINT_Z0 * cosLat * mapHeightPt) / visibleMeters);
  return { center, heading: 0, pitch: 0, zoom: Math.min(20, Math.max(1, zoom)) };
}
