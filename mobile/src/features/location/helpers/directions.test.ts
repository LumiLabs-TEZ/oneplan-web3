import type { TFunction } from 'i18next';

import { haversineMeters, type LatLng } from '@/features/plan/helpers/geo';

import { directionsCamera, directionsModel } from './directions';

const EARTH_RADIUS_METERS = 6_371_000;

/** Builds a point exactly `meters` due north of `place` (same longitude). On a
 * shared meridian the haversine great-circle distance reduces to `R * dLat`
 * (radians) exactly, since `asin(sin(x)) === x` for `x` in `[-pi/2, pi/2]` —
 * so this is the exact inverse of `haversineMeters`, not an approximation. */
function pointNorthOf(place: LatLng, meters: number): LatLng {
  const dLatRad = meters / EARTH_RADIUS_METERS;
  return { latitude: place.latitude + (dLatRad * 180) / Math.PI, longitude: place.longitude };
}

// Fake matching the real i18n render shape for `"%lld min · %@"`
// (`"{{0}} min · {{1}}"` in `src/i18n/locales/en.json`).
const t: TFunction = ((_key: string, params: Record<number, unknown>) =>
  `${params[0]} min · ${params[1]}`) as unknown as TFunction;

const place: LatLng = { latitude: 10, longitude: 106 };

describe('directionsModel', () => {
  it('estimates a 2.5 km walk at ~30 minutes', () => {
    const user = pointNorthOf(place, 2500);
    const model = directionsModel(user, place, 'walk', 'en', t);
    expect(model).not.toBeNull();
    expect(model!.distanceM).toBeCloseTo(2500, 0);
    expect(model!.minutes).toBe(30);
    expect(model!.label).toBe('30 min · 2.5 km');
  });

  it('estimates the same 2.5 km distance by car at ~5 minutes', () => {
    const user = pointNorthOf(place, 2500);
    const model = directionsModel(user, place, 'car', 'en', t);
    expect(model!.minutes).toBe(5);
    expect(model!.label).toBe('5 min · 2.5 km');
  });

  it('sets flySnap once separation exceeds 30 km', () => {
    const near = pointNorthOf(place, 29_000);
    const far = pointNorthOf(place, 35_000);
    expect(directionsModel(near, place, 'car', 'en', t)!.flySnap).toBe(false);
    expect(directionsModel(far, place, 'car', 'en', t)!.flySnap).toBe(true);
  });

  it('floors cameraDistanceM at 1500 for close destinations', () => {
    const user = pointNorthOf(place, 10);
    const model = directionsModel(user, place, 'walk', 'en', t);
    expect(model!.cameraDistanceM).toBe(1500);
  });

  it('scales cameraDistanceM to 5x separation once past the floor', () => {
    const user = pointNorthOf(place, 1000);
    const model = directionsModel(user, place, 'walk', 'en', t);
    expect(model!.cameraDistanceM).toBeCloseTo(5000, -1);
  });

  it('returns null when the user location is missing', () => {
    expect(directionsModel(null, place, 'walk', 'en', t)).toBeNull();
  });

  it('returns null when the place is missing', () => {
    const user = pointNorthOf(place, 2500);
    expect(directionsModel(user, null, 'walk', 'en', t)).toBeNull();
  });

  it('produces a curved point path between user and place', () => {
    const user = pointNorthOf(place, 2500);
    const model = directionsModel(user, place, 'walk', 'en', t);
    expect(model!.points.length).toBe(49);
    expect(model!.points[0]).toEqual(user);
    expect(model!.points[model!.points.length - 1]).toEqual(place);
  });

  it('sanity check: haversineMeters agrees with the fixture builder', () => {
    const user = pointNorthOf(place, 12_345);
    expect(haversineMeters(user, place)).toBeCloseTo(12_345, 0);
  });
});

describe('directionsCamera', () => {
  it('frames the midpoint flat and north-up', () => {
    const user = pointNorthOf(place, 1000);
    const camera = directionsCamera(user, place, 5000, 800);
    expect(camera.center.latitude).toBeCloseTo((user.latitude + place.latitude) / 2, 10);
    expect(camera.center.longitude).toBe(place.longitude);
    expect(camera).toMatchObject({ heading: 0, pitch: 0 });
  });

  it('zooms out one level when the camera distance doubles', () => {
    const near = directionsCamera(place, place, 1500, 800).zoom;
    const far = directionsCamera(place, place, 3000, 800).zoom;
    expect(near - far).toBeCloseTo(1, 5);
  });

  it('clamps continent-scale distances to zoom 1', () => {
    expect(directionsCamera(place, place, 1_000_000_000, 800).zoom).toBe(1);
  });
});
