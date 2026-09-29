/**
 * Blocks a network-only action while offline — generalizes the `Alert(t('Offline'), …)` pattern
 * used by the trip-detail screen (`src/app/trip/[tripId]/index.tsx`'s `openExpense`) for actions
 * that aren't trip-specific (friend requests, profile edits, passport share, delete account, …).
 * Reuses the existing `Please check your connection and try again.` body copy rather than adding a
 * new i18n key.
 *
 * Checks raw `onlineManager.isOnline()`, not `tripAccess.isOffline` (`isOffline = !online ||
 * servingCached`, `src/features/trip/helpers/tripAccess.ts`) — those are different questions.
 * `tripAccess.isOffline` decides whether currently-rendered *read* data is trustworthy (also true
 * while nominally online, if the last fetch failed offline). `requireOnline` is a write-time gate:
 * it only cares whether the device can reach the network right now, so a raw connectivity check is
 * the right signal here.
 */
import type { TFunction } from 'i18next';
import { onlineManager } from '@tanstack/react-query';
import { Alert } from 'react-native';

/**
 * Returns `true` when online. When offline, shows the offline alert and returns `false` — callers
 * bail out of the action:
 * ```
 * if (!requireOnline(t)) return;
 * ```
 */
export function requireOnline(t: TFunction): boolean {
  if (onlineManager.isOnline()) return true;
  Alert.alert(t('Offline'), t('Please check your connection and try again.'));
  return false;
}
