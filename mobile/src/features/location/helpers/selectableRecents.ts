/**
 * Filters recent locations down to ones with a saved coordinate. A recent predating a
 * coordinate on the server (pre-M3.3 saves, or a save that raced a geocode failure) can't fly
 * the camera anywhere meaningful — offering it for reselection would force the picker to
 * construct a `LocationPick` with a fake `(0, 0)` coordinate, so it's dropped from the
 * selectable list entirely instead.
 */
import type { RecentLocationDto } from '../api/recentLocations';

export type SelectableRecentLocation = RecentLocationDto & { latitude: number; longitude: number };

export function selectableRecents(
  recents: readonly RecentLocationDto[],
): SelectableRecentLocation[] {
  return recents.filter(
    (r): r is SelectableRecentLocation =>
      typeof r.latitude === 'number' && typeof r.longitude === 'number',
  );
}
