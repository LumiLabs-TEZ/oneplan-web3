import { t } from 'i18next';

import { initI18n } from '@/i18n';

import { legInfoLabel, mergeLegs } from './useDayRoute';
import type { DayPin } from '../helpers/planDays';
import type { PlanRouteDto } from '../types';

function pin(id: number, index: number, latitude: number, longitude: number): DayPin {
  return { id, index, title: `Pin ${index}`, latitude, longitude, subtitle: null, timeLabel: null };
}

const pins: DayPin[] = [pin(1, 1, 10, 106), pin(2, 2, 10.01, 106.01), pin(3, 3, 10.02, 106.02)];
/** The server's view of the same stops, in the same order. */
const serverPins: PlanRouteDto['pins'] = pins.map((p) => ({ ...p }));

beforeAll(() => {
  initI18n();
});

describe('mergeLegs', () => {
  it('decodes the polyline when route.legs lines up 1:1 with the pin gaps', () => {
    const route: PlanRouteDto = {
      pins: serverPins,
      legs: [
        {
          polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
          durationSec: 300,
          distanceM: 1200,
          mode: 'drive',
        },
        { polyline: null, durationSec: 200, distanceM: 800, mode: 'drive' },
      ],
    };
    const legs = mergeLegs(pins, route);
    expect(legs).toHaveLength(2);
    expect(legs[0]?.fromServer).toBe(true);
    expect(legs[0]?.points.length).toBeGreaterThan(2);
    expect(legs[0]?.durationSec).toBe(300);
    expect(legs[0]?.distanceM).toBe(1200);
  });

  it('falls back to a straight line for a leg with a null polyline', () => {
    const route: PlanRouteDto = {
      pins: serverPins,
      legs: [
        { polyline: null, durationSec: 100, distanceM: 500, mode: 'drive' },
        { polyline: null, durationSec: 100, distanceM: 500, mode: 'drive' },
      ],
    };
    const legs = mergeLegs(pins, route);
    expect(legs[0]?.points).toEqual([
      { latitude: pins[0]!.latitude, longitude: pins[0]!.longitude },
      { latitude: pins[1]!.latitude, longitude: pins[1]!.longitude },
    ]);
    expect(legs[0]?.fromServer).toBe(true);
    expect(legs[0]?.durationSec).toBe(100);
  });

  it('falls back to a straight line for every pair when the leg count does not match', () => {
    const route: PlanRouteDto = {
      pins: serverPins,
      legs: [
        {
          polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
          durationSec: 300,
          distanceM: 1200,
          mode: 'drive',
        },
      ],
    };
    const legs = mergeLegs(pins, route);
    expect(legs).toHaveLength(2);
    for (const leg of legs) {
      expect(leg.fromServer).toBe(false);
      expect(leg.durationSec).toBeNull();
      expect(leg.distanceM).toBeNull();
      expect(leg.points).toHaveLength(2);
    }
  });

  it('falls back to straight lines when the server ordered the stops differently', () => {
    const route: PlanRouteDto = {
      pins: [serverPins[1]!, serverPins[0]!, serverPins[2]!],
      legs: [
        {
          polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
          durationSec: 300,
          distanceM: 1200,
          mode: 'drive',
        },
        {
          polyline: '_p~iF~ps|U_ulLnnqC_mqNvxq`@',
          durationSec: 300,
          distanceM: 1200,
          mode: 'drive',
        },
      ],
    };
    const legs = mergeLegs(pins, route);
    expect(legs.every((leg) => !leg.fromServer && leg.points.length === 2)).toBe(true);
  });

  it('returns a straight line for every pair when no route is available', () => {
    const legs = mergeLegs(pins, undefined);
    expect(legs).toHaveLength(2);
    expect(legs.every((leg) => !leg.fromServer)).toBe(true);
  });

  it('picks walk vs drive by straight-line distance on the fallback', () => {
    // Walk under 1 km: a 0.005° (~0.55 km) hop is walked, a 0.05° (~5.5 km) hop driven.
    const near = [pin(1, 1, 10, 106), pin(2, 2, 10.005, 106)];
    const far = [pin(1, 1, 10, 106), pin(2, 2, 10.05, 106)];
    expect(mergeLegs(near, undefined)[0]?.mode).toBe('walk');
    expect(mergeLegs(far, undefined)[0]?.mode).toBe('drive');
  });

  it('keeps the server mode for server legs', () => {
    const route: PlanRouteDto = {
      pins: serverPins,
      legs: [
        { polyline: null, durationSec: 100, distanceM: 500, mode: 'walk' },
        { polyline: null, durationSec: 100, distanceM: 500, mode: 'drive' },
      ],
    };
    expect(mergeLegs(pins, route).map((leg) => leg.mode)).toEqual(['walk', 'drive']);
  });

  it('returns [] when there is only one pin', () => {
    expect(mergeLegs([pins[0]!], undefined)).toEqual([]);
  });
});

describe('legInfoLabel', () => {
  it('formats minutes and distance', () => {
    const label = legInfoLabel(
      { points: [], durationSec: 610, distanceM: 3400, mode: 'drive', fromServer: true },
      'en',
      t,
    );
    expect(label).toBe('10 min · 3.4 km');
  });

  it('rounds up to a minimum of 1 minute', () => {
    const label = legInfoLabel(
      { points: [], durationSec: 10, distanceM: 50, mode: 'drive', fromServer: true },
      'en',
      t,
    );
    expect(label).toBe('1 min · 0.1 km');
  });

  it('is null when duration is missing', () => {
    const label = legInfoLabel(
      { points: [], durationSec: null, distanceM: 3400, mode: 'drive', fromServer: false },
      'en',
      t,
    );
    expect(label).toBeNull();
  });

  it('is null when distance is missing', () => {
    const label = legInfoLabel(
      { points: [], durationSec: 600, distanceM: null, mode: 'drive', fromServer: false },
      'en',
      t,
    );
    expect(label).toBeNull();
  });
});
