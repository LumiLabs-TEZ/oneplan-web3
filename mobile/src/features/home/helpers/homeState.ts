/**
 * Home render-state selection — port of `HomeView.swift:70-99`. iOS only shows
 * the first-load spinner while trips are loading AND everything else is also
 * empty, so cached content never gets swapped out mid-refresh; otherwise the
 * offline empty state wins when there is no ongoing trip, else the section
 * stack. There is deliberately no "no trips, online" empty state on Home:
 * `HomeView` just skips the Ongoing section (`EmptyHome.swift` is dead code
 * there — it belongs to the Trip tab).
 */

export interface HomeStateInput {
  /** `trips.isFetching` (iOS `tripService.isLoadingTrips`). */
  fetchingTrips: boolean;
  hasOngoing: boolean;
  popularCount: number;
  boardCount: number;
  online: boolean;
}

export type HomeState = 'loading' | 'offline' | 'content';

export function homeState({
  fetchingTrips,
  hasOngoing,
  popularCount,
  boardCount,
  online,
}: HomeStateInput): HomeState {
  if (fetchingTrips && !hasOngoing && popularCount === 0 && boardCount === 0) {
    return 'loading';
  }
  if (!online && !hasOngoing) return 'offline';
  return 'content';
}
