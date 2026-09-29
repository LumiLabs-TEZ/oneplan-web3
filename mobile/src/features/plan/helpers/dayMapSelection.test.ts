import { t } from 'i18next';

import { initI18n } from '@/i18n';

import {
  cameraTargets,
  focusedLeg,
  highlightedLegIndex,
  onUserPan,
  sheetRows,
  togglePin,
  travelerPath,
  type DayMapState,
} from './dayMapSelection';
import type { DayPin } from './planDays';
import type { DayRouteLeg } from '../hooks/useDayRoute';

function pin(id: number, index: number, lat = 10, lon = 106): DayPin {
  return {
    id,
    index,
    title: `Pin ${index}`,
    latitude: lat + index,
    longitude: lon + index,
    subtitle: null,
    timeLabel: null,
  };
}

function leg(durationSec: number | null, distanceM: number | null): DayRouteLeg {
  return { points: [], durationSec, distanceM, mode: 'drive', fromServer: durationSec != null };
}

describe('highlightedLegIndex', () => {
  const pins = [pin(1, 1), pin(2, 2), pin(3, 3)];

  it('returns null when nothing is selected', () => {
    expect(highlightedLegIndex(pins, null)).toBeNull();
  });

  it('returns the outgoing leg for a middle pin', () => {
    expect(highlightedLegIndex(pins, 2)).toBe(1);
  });

  it('returns the outgoing leg for the first pin', () => {
    expect(highlightedLegIndex(pins, 1)).toBe(0);
  });

  it('falls back to the incoming leg for the last pin', () => {
    expect(highlightedLegIndex(pins, 3)).toBe(1);
  });

  it('returns null for an unknown pin id', () => {
    expect(highlightedLegIndex(pins, 999)).toBeNull();
  });

  it('returns null when there is only one pin', () => {
    expect(highlightedLegIndex([pin(1, 1)], 1)).toBeNull();
  });
});

describe('cameraTargets', () => {
  const pins = [pin(1, 1), pin(2, 2), pin(3, 3)];

  it('returns every pin when nothing is selected', () => {
    expect(cameraTargets(pins, null)).toHaveLength(3);
  });

  it('returns the selected pin + the next pin for a non-last selection', () => {
    const targets = cameraTargets(pins, 1);
    expect(targets).toEqual([
      { latitude: pins[0]!.latitude, longitude: pins[0]!.longitude },
      { latitude: pins[1]!.latitude, longitude: pins[1]!.longitude },
    ]);
  });

  it('returns the selected pin + the previous pin for the last selection', () => {
    const targets = cameraTargets(pins, 3);
    expect(targets).toEqual([
      { latitude: pins[2]!.latitude, longitude: pins[2]!.longitude },
      { latitude: pins[1]!.latitude, longitude: pins[1]!.longitude },
    ]);
  });

  it('falls back to every pin for an unknown pin id', () => {
    expect(cameraTargets(pins, 999)).toHaveLength(3);
  });

  it('includes every route point in the overview fit', () => {
    const detour = { latitude: 5, longitude: 100 };
    const legs = [
      { ...leg(60, 100), points: [detour] },
      { ...leg(60, 100), points: [{ latitude: 13, longitude: 109 }] },
    ];
    const targets = cameraTargets(pins, null, legs);
    expect(targets).toHaveLength(5);
    expect(targets).toContainEqual(detour);
  });

  it('includes only the highlighted leg route points for a selection', () => {
    const legs = [
      { ...leg(60, 100), points: [{ latitude: 1, longitude: 1 }] },
      { ...leg(60, 100), points: [{ latitude: 2, longitude: 2 }] },
    ];
    expect(cameraTargets(pins, 2, legs)).toContainEqual({ latitude: 2, longitude: 2 });
    expect(cameraTargets(pins, 2, legs)).not.toContainEqual({ latitude: 1, longitude: 1 });
  });
});

describe('togglePin', () => {
  it('selects a different pin and expands the sheet', () => {
    const state: DayMapState = { selectedPinId: null, sheet: 'mini' };
    expect(togglePin(state, 5)).toEqual({ selectedPinId: 5, sheet: 'expanded' });
  });

  it('deselects the same pin but still expands the sheet', () => {
    const state: DayMapState = { selectedPinId: 5, sheet: 'mini' };
    expect(togglePin(state, 5)).toEqual({ selectedPinId: null, sheet: 'expanded' });
  });
});

describe('onUserPan', () => {
  it('collapses to the mini sheet without touching selection', () => {
    const state: DayMapState = { selectedPinId: 5, sheet: 'expanded' };
    expect(onUserPan(state)).toEqual({ selectedPinId: 5, sheet: 'mini' });
  });
});

describe('sheetRows', () => {
  beforeAll(() => {
    initI18n();
  });

  it('interleaves stop rows with leg-info rows when the leg has data', () => {
    const pins = [pin(1, 1), pin(2, 2), pin(3, 3)];
    const legs = [leg(600, 3000), leg(null, null)];
    const rows = sheetRows(pins, legs, 'en', t);
    expect(rows.map((r) => r.kind)).toEqual(['stop', 'leg', 'stop', 'stop']);
    expect(rows[1]).toMatchObject({ kind: 'leg', index: 0 });
  });

  it('renders only stop rows when there are no legs', () => {
    const pins = [pin(1, 1)];
    const rows = sheetRows(pins, [], 'en', t);
    expect(rows).toEqual([{ kind: 'stop', pin: pins[0] }]);
  });
});

describe('focusedLeg', () => {
  const pins = [pin(11, 1), pin(12, 2), pin(13, 3)];
  const legs = [leg(290, 1500), leg(null, null)];

  beforeAll(() => {
    initI18n();
  });

  it('is null with no selection', () => {
    expect(focusedLeg(pins, legs, null, 'en', t)).toBeNull();
  });

  it('shows the selected stop → the next stop, with time and distance', () => {
    const result = focusedLeg(pins, legs, 11, 'en', t);
    expect(result?.from.id).toBe(11);
    expect(result?.to.id).toBe(12);
    expect(result?.duration).toBe('5 min');
    expect(result?.distance).toBe('1.5 km');
  });

  it('shows the previous stop → the last stop when the last stop is selected', () => {
    const result = focusedLeg(pins, legs, 13, 'en', t);
    expect(result?.from.id).toBe(12);
    expect(result?.to.id).toBe(13);
  });

  it('omits time and distance for a straight-line fallback leg', () => {
    const result = focusedLeg(pins, legs, 12, 'en', t);
    expect(result?.duration).toBeNull();
    expect(result?.distance).toBeNull();
  });

  it('is null on a single-stop day', () => {
    expect(focusedLeg([pin(11, 1)], [], 11, 'en', t)).toBeNull();
  });
});

describe('travelerPath', () => {
  const pins = [pin(1, 1), pin(2, 2), pin(3, 3)];
  const a = { latitude: 1, longitude: 1 };
  const b = { latitude: 2, longitude: 2 };
  const c = { latitude: 3, longitude: 3 };
  const legs = [
    { ...leg(60, 100), points: [a, b] },
    { ...leg(60, 100), points: [b, c] },
  ];

  it('is empty in the overview (the car only plays for a selection)', () => {
    expect(travelerPath(pins, legs, null)).toEqual([]);
  });

  it('is the highlighted leg for a selection', () => {
    expect(travelerPath(pins, legs, 1)).toEqual([a, b]);
    expect(travelerPath(pins, legs, 3)).toEqual([b, c]);
  });

  it('is empty with no legs', () => {
    expect(travelerPath([pin(1, 1)], [], null)).toEqual([]);
    expect(travelerPath([pin(1, 1)], [], 1)).toEqual([]);
  });
});
