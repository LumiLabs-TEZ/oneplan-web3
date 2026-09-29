/**
 * Pure gating for the Pro-only Insight tab — port of the revert-on-close rule in
 * `TripDetailView.swift:1427-1451` (`handleInsightPaywallClosed`). The trip detail screen pushes
 * `/paywall` when the user selects Insight without Pro (kept as a side effect there, not here);
 * this helper decides what the *tab state* should be, both for that initial selection and for the
 * `useFocusEffect` re-check on regaining focus (e.g. the user backed out of `/paywall` without
 * upgrading while Insight was already the active tab).
 */
import type { TripTab } from '../components/TripTabBar';

export function resolveInsightTab({
  requested,
  isPro,
  prevTab,
}: {
  requested: TripTab;
  isPro: boolean;
  prevTab: TripTab;
}): TripTab {
  if (requested === 'insight' && !isPro) return prevTab;
  return requested;
}
