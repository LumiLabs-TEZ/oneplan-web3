/**
 * Google encoded-polyline encoder — the format `PlanRouteLegDto.polyline`
 * carries and the mobile client decodes (`mobile/src/features/plan/helpers/polyline.ts`).
 * Standard algorithm: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export interface LatLng {
  latitude: number;
  longitude: number;
}

function encodeSigned(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let out = '';
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  return out + String.fromCharCode(v + 63);
}

export function encodePolyline(
  points: readonly LatLng[],
  precision = 5,
): string {
  const factor = 10 ** precision;
  let prevLat = 0;
  let prevLng = 0;
  let out = '';
  for (const { latitude, longitude } of points) {
    const lat = Math.round(latitude * factor);
    const lng = Math.round(longitude * factor);
    out += encodeSigned(lat - prevLat) + encodeSigned(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}
