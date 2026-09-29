import {
  appleMapsUrl,
  bearingDegrees,
  coordString,
  cumulativeMeters,
  estimateMinutes,
  fittedRegion,
  formatDistanceKm,
  googleMapsUrl,
  haversineMeters,
  metersPerPoint,
  placeQuery,
  pointAlongPath,
  quadraticBezier,
  walkDashPattern,
} from './geo';

const HCMC = { latitude: 10.8231, longitude: 106.6297 };
const HANOI = { latitude: 21.0285, longitude: 105.8542 };

describe('haversineMeters', () => {
  it('is zero for identical points', () => {
    expect(haversineMeters(HCMC, HCMC)).toBe(0);
  });

  it('computes HCMC -> Hanoi within 1% of the known ~1140 km distance', () => {
    const meters = haversineMeters(HCMC, HANOI);
    const km = meters / 1000;
    expect(km).toBeGreaterThan(1140 * 0.99);
    expect(km).toBeLessThan(1140 * 1.01);
  });

  it('is symmetric', () => {
    expect(haversineMeters(HCMC, HANOI)).toBeCloseTo(haversineMeters(HANOI, HCMC), 6);
  });
});

describe('formatDistanceKm', () => {
  it('formats under 10km with one decimal (en)', () => {
    expect(formatDistanceKm(3210, 'en')).toBe('3.2 km');
  });

  it('formats under 10km with one decimal (vi, comma decimal)', () => {
    expect(formatDistanceKm(3210, 'vi')).toBe('3,2 km');
  });

  it('formats at/above 10km as a rounded integer (en)', () => {
    expect(formatDistanceKm(12_400, 'en')).toBe('12 km');
  });

  it('formats large distances with locale grouping (en)', () => {
    expect(formatDistanceKm(1_140_000, 'en')).toBe('1,140 km');
  });

  it('formats large distances with locale grouping (vi)', () => {
    expect(formatDistanceKm(1_140_000, 'vi')).toBe('1.140 km');
  });

  it('formats zero distance', () => {
    expect(formatDistanceKm(0, 'en')).toBe('0.0 km');
  });
});

describe('bearingDegrees', () => {
  it('is 0..360', () => {
    const deg = bearingDegrees(HCMC, HANOI);
    expect(deg).toBeGreaterThanOrEqual(0);
    expect(deg).toBeLessThan(360);
  });

  it('points due north as ~0 degrees', () => {
    const deg = bearingDegrees({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });
    expect(deg).toBeCloseTo(0, 3);
  });

  it('points due east as ~90 degrees', () => {
    const deg = bearingDegrees({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 });
    expect(deg).toBeCloseTo(90, 3);
  });
});

describe('quadraticBezier', () => {
  it('produces samples+1 points', () => {
    const points = quadraticBezier(
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 1 },
      10,
    );
    expect(points).toHaveLength(11);
  });

  it('starts at from and ends at to', () => {
    const from = { latitude: 10, longitude: 20 };
    const to = { latitude: 12, longitude: 22 };
    const points = quadraticBezier(from, to);
    expect(points[0]).toEqual(from);
    expect(points[points.length - 1]!.latitude).toBeCloseTo(to.latitude, 9);
    expect(points[points.length - 1]!.longitude).toBeCloseTo(to.longitude, 9);
  });

  it('bulges away from the straight line at the midpoint', () => {
    const from = { latitude: 0, longitude: 0 };
    const to = { latitude: 0, longitude: 1 };
    const points = quadraticBezier(from, to, 48, 0.18);
    const mid = points[24]!;
    // Straight-line midpoint would have latitude 0; the arc offsets it.
    expect(Math.abs(mid.latitude)).toBeGreaterThan(0.001);
  });

  it('falls back to [from, to] when from equals to', () => {
    const p = { latitude: 5, longitude: 5 };
    expect(quadraticBezier(p, p)).toEqual([p, p]);
  });
});

describe('estimateMinutes', () => {
  it('estimates walking time', () => {
    // 5 km at 5 km/h -> 60 min
    expect(estimateMinutes(5000, 'walk')).toBe(60);
  });

  it('estimates driving time', () => {
    // 30 km at 30 km/h -> 60 min
    expect(estimateMinutes(30_000, 'car')).toBe(60);
  });

  it('rounds up fractional minutes', () => {
    // 1 km at 5 km/h -> 12 min exactly
    expect(estimateMinutes(1000, 'walk')).toBe(12);
    // A small nudge should round up to 13.
    expect(estimateMinutes(1001, 'walk')).toBe(13);
  });

  it('floors at 1 minute for tiny distances', () => {
    expect(estimateMinutes(1, 'car')).toBe(1);
    expect(estimateMinutes(0, 'walk')).toBe(1);
  });
});

describe('fittedRegion', () => {
  it('returns a default centered region for no points', () => {
    expect(fittedRegion([])).toEqual({
      latitude: 0,
      longitude: 0,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    });
  });

  it('centers on a single point with the minimum span', () => {
    const region = fittedRegion([{ latitude: 10, longitude: 20 }]);
    expect(region.latitude).toBe(10);
    expect(region.longitude).toBe(20);
    expect(region.latitudeDelta).toBe(0.005);
    expect(region.longitudeDelta).toBe(0.005);
  });

  it('pads the bounding box by the factor for spread-out points', () => {
    const region = fittedRegion(
      [
        { latitude: 10, longitude: 20 },
        { latitude: 11, longitude: 21 },
      ],
      1.4,
    );
    expect(region.latitude).toBe(10.5);
    expect(region.longitude).toBe(20.5);
    expect(region.latitudeDelta).toBeCloseTo(1.4, 9);
    expect(region.longitudeDelta).toBeCloseTo(1.4, 9);
  });
});

describe('coordString', () => {
  it('joins lat,lng with a literal dot decimal', () => {
    expect(coordString({ latitude: 10.5, longitude: -20.25 })).toBe('10.5,-20.25');
  });

  it('handles integers without a trailing dot', () => {
    expect(coordString({ latitude: 10, longitude: 20 })).toBe('10,20');
  });
});

describe('googleMapsUrl', () => {
  it('builds a walking directions link without origin', () => {
    const url = googleMapsUrl({ destination: { latitude: 10, longitude: 20 }, mode: 'walk' });
    expect(url).toBe('https://www.google.com/maps/dir/?api=1&destination=10,20&travelmode=walking');
  });

  it('includes origin and driving mode when provided', () => {
    const url = googleMapsUrl({
      destination: { latitude: 10, longitude: 20 },
      origin: { latitude: 1, longitude: 2 },
      mode: 'car',
    });
    expect(url).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=10,20&origin=1,2&travelmode=driving',
    );
  });
  it('uses place queries instead of coordinates when given', () => {
    const url = googleMapsUrl({
      destination: { latitude: 10, longitude: 20 },
      origin: { latitude: 1, longitude: 2 },
      mode: 'car',
      destinationQuery: 'Bánh căn Nhà Chung, Đà Lạt',
      originQuery: 'Hồ Xuân Hương',
    });
    expect(url).toBe(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('Bánh căn Nhà Chung, Đà Lạt')}&origin=${encodeURIComponent('Hồ Xuân Hương')}&travelmode=driving`,
    );
  });

  it('ignores originQuery when there is no origin', () => {
    const url = googleMapsUrl({
      destination: { latitude: 10, longitude: 20 },
      mode: 'walk',
      originQuery: 'Somewhere',
    });
    expect(url).toBe('https://www.google.com/maps/dir/?api=1&destination=10,20&travelmode=walking');
  });
});

describe('placeQuery', () => {
  it('joins name and address', () => {
    expect(placeQuery(' Cafe ', ' 1 Main St ')).toBe('Cafe, 1 Main St');
  });

  it('drops the name when the address already contains it', () => {
    expect(placeQuery('Cafe', 'cafe, 1 Main St')).toBe('cafe, 1 Main St');
  });

  it('returns whichever part is present, or undefined', () => {
    expect(placeQuery('Cafe', null)).toBe('Cafe');
    expect(placeQuery('  ', '1 Main St')).toBe('1 Main St');
    expect(placeQuery(undefined, '')).toBeUndefined();
  });
});

describe('appleMapsUrl', () => {
  it('builds a walking link with dirflg=w and no saddr/q by default', () => {
    const url = appleMapsUrl({ destination: { latitude: 10, longitude: 20 }, mode: 'walk' });
    expect(url).toBe('https://maps.apple.com/?daddr=10,20&dirflg=w');
  });

  it('builds a driving link with dirflg=d', () => {
    const url = appleMapsUrl({ destination: { latitude: 10, longitude: 20 }, mode: 'car' });
    expect(url).toBe('https://maps.apple.com/?daddr=10,20&dirflg=d');
  });

  it('includes saddr when origin is given', () => {
    const url = appleMapsUrl({
      destination: { latitude: 10, longitude: 20 },
      origin: { latitude: 1, longitude: 2 },
      mode: 'walk',
    });
    expect(url).toBe('https://maps.apple.com/?daddr=10,20&saddr=1,2&dirflg=w');
  });

  it('appends q with the encoded name when provided', () => {
    const url = appleMapsUrl({
      destination: { latitude: 10, longitude: 20 },
      mode: 'walk',
      name: 'Cafe & Bar',
    });
    expect(url).toBe(
      `https://maps.apple.com/?daddr=10,20&dirflg=w&q=${encodeURIComponent('Cafe & Bar')}`,
    );
  });

  it('omits q when name is not provided', () => {
    const url = appleMapsUrl({ destination: { latitude: 10, longitude: 20 }, mode: 'car' });
    expect(url).not.toContain('q=');
  });
});

describe('pointAlongPath', () => {
  // Along a meridian, so distance is proportional to latitude: segment 1 is 1°, segment 2 is 3°.
  const path = [
    { latitude: 0, longitude: 0 },
    { latitude: 1, longitude: 0 },
    { latitude: 4, longitude: 0 },
  ];
  const cumulative = cumulativeMeters(path);

  it('accumulates distance per vertex', () => {
    expect(cumulative).toHaveLength(3);
    expect(cumulative[0]).toBe(0);
    expect(cumulative[2]! / cumulative[1]!).toBeCloseTo(4, 5);
  });

  it('returns the endpoints at 0 and 1', () => {
    expect(pointAlongPath(path, cumulative, 0)).toEqual(path[0]);
    expect(pointAlongPath(path, cumulative, 1).latitude).toBeCloseTo(4, 6);
  });

  it('is weighted by distance, not by vertex count', () => {
    // Halfway by distance is 2° — inside the longer second segment.
    expect(pointAlongPath(path, cumulative, 0.5).latitude).toBeCloseTo(2, 5);
  });

  it('clamps fractions outside 0..1', () => {
    expect(pointAlongPath(path, cumulative, -1)).toEqual(path[0]);
    expect(pointAlongPath(path, cumulative, 2).latitude).toBeCloseTo(4, 6);
  });

  it('handles degenerate paths', () => {
    const one = [{ latitude: 5, longitude: 5 }];
    expect(pointAlongPath(one, cumulativeMeters(one), 0.5)).toEqual(one[0]);
    const same = [one[0]!, one[0]!];
    expect(pointAlongPath(same, cumulativeMeters(same), 0.5)).toEqual(one[0]);
  });
});

describe('walkDashPattern', () => {
  it('scales iOS (Google Maps meters) with the zoom', () => {
    const zoomedOut = walkDashPattern('ios', metersPerPoint(0.02, 800), 3);
    const zoomedIn = walkDashPattern('ios', metersPerPoint(0.005, 800), 3);
    expect(zoomedOut[0]).toBeGreaterThan(zoomedIn[0]);
    // 0.02° over 800 pt ≈ 2.8 m/pt → a 6 pt dash ≈ 17 m.
    expect(zoomedOut[0]).toBeCloseTo(17, 0);
  });

  it('uses device pixels on Android, independent of zoom', () => {
    expect(walkDashPattern('android', 123, 3)).toEqual([18, 15]);
  });

  it('is zero-safe for an unmeasured map', () => {
    expect(metersPerPoint(0.02, 0)).toBe(0);
  });
});
