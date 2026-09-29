/**
 * Pure geo math + maps deep-link builders. No RN imports (react-native-maps
 * exports a `Region` type, but this module stays framework-free so it can run
 * under plain node in tests).
 *
 * Ports:
 * - `quadraticBezier` <- `curvedRouteCoordinates`
 *   (`ios/OnePlan/OnePlan/View/LocationDetailView.swift:1252-1285`)
 * - `fittedRegion` <- `PlanDayMapView.fittedRegion`
 *   (`ios/OnePlan/OnePlan/View/Plan/PlanDayMapView.swift:61-90`)
 * - `estimateMinutes` pace <- `LocationDirectionsTransportMode.paceMetersPerMinute`
 *   (`ios/OnePlan/OnePlan/Component/LocationDetail/LocationDirectionsOverlay.swift:15-19`)
 * - `formatDistanceKm` <- `TripPlanSection.distanceText`
 *   (`ios/OnePlan/OnePlan/Component/Trip/TripPlanSection.swift:246-263`)
 */

export type LatLng = { latitude: number; longitude: number };

/** Mirrors `react-native-maps`' `Region` shape without importing RN. */
export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type TransportMode = 'walk' | 'car';

/** Average travel pace in km/h per mode (`5` walking, `30` driving). */
export const PACE_KMH: Record<TransportMode, number> = { walk: 5, car: 30 };

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Great-circle distance between two points, in meters. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** Running great-circle distance at each vertex of `points` (first entry is `0`). */
export function cumulativeMeters(points: readonly LatLng[]): number[] {
  const out: number[] = [];
  let total = 0;
  points.forEach((p, i) => {
    if (i > 0) total += haversineMeters(points[i - 1]!, p);
    out.push(total);
  });
  return out;
}

/**
 * The point `fraction` (clamped to 0..1) of the way along `points`, measured by
 * distance — so motion along the path is constant-speed regardless of how the
 * vertices are spaced. `cumulative` is `cumulativeMeters(points)`.
 */
export function pointAlongPath(
  points: readonly LatLng[],
  cumulative: readonly number[],
  fraction: number,
): LatLng {
  const first = points[0];
  if (!first) return { latitude: 0, longitude: 0 };
  const total = cumulative[cumulative.length - 1] ?? 0;
  if (points.length < 2 || total <= 0) return first;
  const target = Math.min(1, Math.max(0, fraction)) * total;
  let i = 1;
  while (i < cumulative.length - 1 && cumulative[i]! < target) i += 1;
  const a = points[i - 1]!;
  const b = points[i]!;
  const span = cumulative[i]! - cumulative[i - 1]!;
  const t = span > 0 ? (target - cumulative[i - 1]!) / span : 0;
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
}

/** Walking-leg dash and gap, in screen points. */
const WALK_DASH_PT = 6;
const WALK_GAP_PT = 5;

/**
 * `Polyline.lineDashPattern` for a walked leg on Google Maps, which takes different units
 * per platform: iOS feeds the values to `GMSStyleSpans` as *map meters* (so they must be
 * scaled by the current zoom — `metersPerPoint`), Android as *screen pixels*.
 */
export function walkDashPattern(
  os: string,
  metersPerPoint: number,
  pixelRatio: number,
): [number, number] {
  if (os === 'ios') {
    // Two significant digits: stable across tiny region jitter, so the spans aren't rebuilt.
    const round = (v: number) => Number(v.toPrecision(2));
    return [round(WALK_DASH_PT * metersPerPoint), round(WALK_GAP_PT * metersPerPoint)];
  }
  return [WALK_DASH_PT * pixelRatio, WALK_GAP_PT * pixelRatio];
}

/** Meters per screen point for a map showing `latitudeDelta` over `heightPt` points. */
export function metersPerPoint(latitudeDelta: number, heightPt: number): number {
  return heightPt > 0 ? (latitudeDelta * 111_320) / heightPt : 0;
}

/**
 * Locale-aware distance label. Under 10 km shows one decimal place
 * (`"3.2 km"` / `"3,2 km"`); at or above 10 km shows a rounded integer with
 * locale grouping. Unit stays the literal `" km"` suffix regardless of locale.
 */
export function formatDistanceKm(meters: number, locale: 'en' | 'vi'): string {
  const km = meters / 1000;
  if (km < 10) return `${distanceFormatter(locale, 'tenths').format(km)} km`;
  return `${distanceFormatter(locale, 'whole').format(Math.round(km))} km`;
}

// Building an `Intl.NumberFormat` is far costlier than formatting with one, and route legs
// format a label per leg on every render — keep one per (language, precision).
const distanceFormatters = new Map<string, Intl.NumberFormat>();

function distanceFormatter(locale: 'en' | 'vi', precision: 'tenths' | 'whole'): Intl.NumberFormat {
  const cacheKey = `${locale}|${precision}`;
  let formatter = distanceFormatters.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.NumberFormat(
      locale === 'vi' ? 'vi-VN' : 'en-US',
      precision === 'tenths'
        ? { minimumFractionDigits: 1, maximumFractionDigits: 1 }
        : { maximumFractionDigits: 0 },
    );
    distanceFormatters.set(cacheKey, formatter);
  }
  return formatter;
}

/** Initial bearing from `from` to `to`, in degrees, normalized to `[0, 360)`. */
export function bearingDegrees(from: LatLng, to: LatLng): number {
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const deg = toDegrees(Math.atan2(y, x));
  return (deg + 360) % 360;
}

/**
 * Samples a quadratic Bezier curve between `from` and `to`, offset by a
 * perpendicular control point, so route lines read as a gentle arc instead of
 * a straight dash. Degenerate (`from === to`) falls back to `[from, to]`.
 */
export function quadraticBezier(
  from: LatLng,
  to: LatLng,
  samples = 48,
  curvature = 0.18,
): LatLng[] {
  const dLat = to.latitude - from.latitude;
  const dLon = to.longitude - from.longitude;
  const length = Math.sqrt(dLat * dLat + dLon * dLon);
  if (length === 0) return [from, to];

  const perpLat = -dLon / length;
  const perpLon = dLat / length;
  const midLat = (from.latitude + to.latitude) / 2;
  const midLon = (from.longitude + to.longitude) / 2;
  const controlLat = midLat + perpLat * length * curvature;
  const controlLon = midLon + perpLon * length * curvature;

  const points: LatLng[] = [];
  for (let step = 0; step <= samples; step++) {
    const t = step / samples;
    const oneMinusT = 1 - t;
    const latitude =
      oneMinusT * oneMinusT * from.latitude + 2 * oneMinusT * t * controlLat + t * t * to.latitude;
    const longitude =
      oneMinusT * oneMinusT * from.longitude +
      2 * oneMinusT * t * controlLon +
      t * t * to.longitude;
    points.push({ latitude, longitude });
  }
  return points;
}

/** Travel time estimate in whole minutes, rounded up, floored at 1. */
export function estimateMinutes(meters: number, mode: TransportMode): number {
  const km = meters / 1000;
  const hours = km / PACE_KMH[mode];
  return Math.max(1, Math.ceil(hours * 60));
}

/** Bounding-box region around `points`, padded by `factor` and floored at `minSpan`. */
export function fittedRegion(points: readonly LatLng[], factor = 1.4, minSpan = 0.005): Region {
  if (points.length === 0) {
    return { latitude: 0, longitude: 0, latitudeDelta: minSpan, longitudeDelta: minSpan };
  }

  let minLat = points[0]!.latitude;
  let maxLat = points[0]!.latitude;
  let minLon = points[0]!.longitude;
  let maxLon = points[0]!.longitude;
  for (const p of points.slice(1)) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLon = Math.min(minLon, p.longitude);
    maxLon = Math.max(maxLon, p.longitude);
  }

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * factor, minSpan),
    longitudeDelta: Math.max((maxLon - minLon) * factor, minSpan),
  };
}

/**
 * `"lat,lng"` using plain `Number#toString()` — always `.`-decimal regardless
 * of device locale (the map-routing lesson: never use `toLocaleString` here).
 */
export function coordString(p: LatLng): string {
  return `${p.latitude},${p.longitude}`;
}

function travelModeParam(mode: TransportMode): 'walking' | 'driving' {
  return mode === 'walk' ? 'walking' : 'driving';
}

function dirflgParam(mode: TransportMode): 'w' | 'd' {
  return mode === 'walk' ? 'w' : 'd';
}

/**
 * Apple Maps web-link deep link: `https://maps.apple.com/?daddr=<lat>,<lng>
 * [&saddr=<lat>,<lng>]&dirflg=<d|w>[&q=<name>]`. `dirflg` is `d` for car, `w`
 * for walk; `saddr` only appears when `origin` is given; `q` (the
 * destination pin label) only appears when `name` is given.
 */
export function appleMapsUrl(params: {
  destination: LatLng;
  origin?: LatLng;
  mode: TransportMode;
  name?: string;
}): string {
  const query = [`daddr=${coordString(params.destination)}`];
  if (params.origin) query.push(`saddr=${coordString(params.origin)}`);
  query.push(`dirflg=${dirflgParam(params.mode)}`);
  if (params.name) query.push(`q=${encodeURIComponent(params.name)}`);
  return `https://maps.apple.com/?${query.join('&')}`;
}

/**
 * Text query for a place: `"<name>, <address>"`, trimmed, empty parts dropped, and the name
 * omitted when the address already contains it. `undefined` when both are empty.
 */
export function placeQuery(name?: string | null, address?: string | null): string | undefined {
  const n = (name ?? '').trim();
  const a = (address ?? '').trim();
  if (n && a) return a.toLowerCase().includes(n.toLowerCase()) ? a : `${n}, ${a}`;
  return n || a || undefined;
}

/**
 * Google Maps turn-by-turn deep link (mirrors `LocationDetailView.openInGoogleMaps`).
 * Google has no pin-label param, so `destinationQuery`/`originQuery` (a place name/address)
 * replace the coordinates when given — otherwise the from/to fields show raw lat/lng.
 * `originQuery` only applies alongside `origin`, so an omitted origin stays "current location".
 */
export function googleMapsUrl(params: {
  destination: LatLng;
  origin?: LatLng;
  mode: TransportMode;
  destinationQuery?: string;
  originQuery?: string;
}): string {
  const destination = params.destinationQuery
    ? encodeURIComponent(params.destinationQuery)
    : coordString(params.destination);
  const query = ['api=1', `destination=${destination}`];
  if (params.origin) {
    const origin = params.originQuery
      ? encodeURIComponent(params.originQuery)
      : coordString(params.origin);
    query.push(`origin=${origin}`);
  }
  query.push(`travelmode=${travelModeParam(params.mode)}`);
  return `https://www.google.com/maps/dir/?${query.join('&')}`;
}
