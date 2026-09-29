/**
 * Guards the plan create/edit form routes against being reached while the trip is read-only
 * (offline, or an ended trip — see `access.canEdit`) — e.g. a stale deep link, or the trip
 * flipping to offline/ended while the form sits open in the background. Mirrors the offline
 * guard on `TripDetailScreen.openExpense` (`app/trip/[tripId]/index.tsx`): same alert copy,
 * same "go back immediately" behaviour.
 *
 * `tripAccess().canEdit` is `false` while the trip query has no data yet (status `undefined`
 * reads as not-editable) — so on a cold start / deep link / fast nav, `canEdit` is transiently
 * `false` before the trip has even loaded, which is not the same as the trip being read-only.
 * `ready` (pass `!!detail.trip`) distinguishes "still loading" from "loaded and read-only": the
 * guard only fires once the trip has actually loaded and reads as non-editable.
 */
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Alert } from 'react-native';

export interface PlanFormAccessGuardInput {
  /** `true` once the trip has loaded (`!!detail.trip`) — gates the guard so it never fires while
   * `canEdit` is only transiently `false` because nothing has loaded yet. */
  ready: boolean;
  canEdit: boolean;
}

/** `true` once the guard has fired and the caller should stop rendering the form (also `true`
 * while `!ready`, so the caller keeps showing its loading state instead of the form). */
export function usePlanFormAccessGuard(
  { ready, canEdit }: PlanFormAccessGuardInput,
  t: (key: string) => string,
): boolean {
  const blocked = !ready || !canEdit;
  const shouldAlert = ready && !canEdit;

  useEffect(() => {
    if (!shouldAlert) return;
    Alert.alert(t('Offline'), t("You're offline\nOnly an ongoing trip can be viewed offline"));
    router.back();
  }, [shouldAlert, t]);

  return blocked;
}
