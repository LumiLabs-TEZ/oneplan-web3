/**
 * FAB quick actions — port of `QuickAction` in `ios/OnePlan/OnePlan/View/MainView.swift:48-80`.
 * `title` is an i18n key. `symbol` is the iOS SF Symbol (native tab bar); `icon` is the Ionicons
 * stand-in used by the JS bar.
 * `proOnly` mirrors the `PremiumGate` wrap on `uploadTrip` (`MainView.swift:810-817`).
 */
export type QuickActionKind = 'scanQR' | 'newTrip' | 'uploadTrip';

export interface QuickAction {
  id: QuickActionKind;
  icon: 'qr-code-outline' | 'globe-outline' | 'share-outline';
  symbol: string;
  title: string;
  proOnly: boolean;
}

export const QUICK_ACTIONS: readonly QuickAction[] = [
  {
    id: 'scanQR',
    icon: 'qr-code-outline',
    symbol: 'qrcode.viewfinder',
    title: 'Scan QR',
    proOnly: false,
  },
  {
    id: 'newTrip',
    icon: 'globe-outline',
    symbol: 'globe.americas',
    title: 'New trip',
    proOnly: false,
  },
  {
    id: 'uploadTrip',
    icon: 'share-outline',
    symbol: 'square.and.arrow.up',
    title: 'Upload Trip',
    proOnly: true,
  },
];

/** Free tier may hold at most this many PLANNING trips (`TripService.swift:19`). */
export const FREE_PLANNING_TRIP_LIMIT = 3;

export type QuickActionOutcome =
  | { type: 'open'; action: QuickActionKind }
  | { type: 'paywall'; reason: 'pro_required' | 'planning_limit' };

/**
 * Decide what tapping a quick action does. Mirrors `MainView.swift:819-854`:
 * `uploadTrip` needs Pro; `newTrip` is capped for free users
 * (`TripService.canCreatePlanningTrip`).
 */
export function resolveQuickAction(
  action: QuickActionKind,
  ctx: { isPro: boolean; planningTripCount: number },
): QuickActionOutcome {
  if (action === 'uploadTrip' && !ctx.isPro) return { type: 'paywall', reason: 'pro_required' };
  if (action === 'newTrip' && !ctx.isPro && ctx.planningTripCount >= FREE_PLANNING_TRIP_LIMIT) {
    return { type: 'paywall', reason: 'planning_limit' };
  }
  return { type: 'open', action };
}
