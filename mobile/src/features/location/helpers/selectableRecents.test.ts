import type { RecentLocationDto } from '../api/recentLocations';
import { selectableRecents } from './selectableRecents';

function recent(overrides: Partial<RecentLocationDto> = {}): RecentLocationDto {
  return {
    id: 1,
    name: 'Place',
    lastViewedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('selectableRecents', () => {
  it('keeps recents with a numeric latitude/longitude', () => {
    const withCoords = recent({ latitude: 1, longitude: 2 });
    expect(selectableRecents([withCoords])).toEqual([withCoords]);
  });

  it('drops recents missing latitude/longitude (undefined or null) rather than faking (0, 0)', () => {
    const noCoords = recent({ latitude: undefined, longitude: undefined });
    const nullCoords = recent({ id: 2, latitude: null, longitude: null });
    const partialCoords = recent({ id: 3, latitude: 1, longitude: undefined });
    expect(selectableRecents([noCoords, nullCoords, partialCoords])).toEqual([]);
  });

  it('filters a mixed list down to only the ones with coordinates', () => {
    const good = recent({ id: 1, latitude: 10, longitude: 20 });
    const bad = recent({ id: 2, latitude: null, longitude: null });
    expect(selectableRecents([good, bad])).toEqual([good]);
  });
});
