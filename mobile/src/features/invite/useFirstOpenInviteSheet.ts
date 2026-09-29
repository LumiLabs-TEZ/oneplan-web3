/**
 * One-shot invite sheet on the first open of a trip, shown to any member
 * (`TripDetailView.presentFirstOpenInviteSheetIfNeeded`). The MMKV flag is
 * written only when the sheet actually presents, so a skipped open (offline,
 * profile not loaded yet) retries next time.
 */
import { useEffect, useRef } from 'react';

import type { TripDto } from '@/features/trip/types';
import { storage } from '@/offline/mmkv';
import { useIsOnline } from '@/offline/servingCached';
import type { AppSheetRef } from '@/ui/components';

import { firstOpenInviteKey, shouldShowFirstOpenInvite } from './helpers/firstOpenInvite';

/** Returns the ref the screen must attach to its `AppSheet`. */
export function useFirstOpenInviteSheet(trip: TripDto | undefined) {
  const sheetRef = useRef<AppSheetRef>(null);
  const presented = useRef(false);
  const online = useIsOnline();

  useEffect(() => {
    if (!trip || presented.current) return;
    const key = firstOpenInviteKey(trip.id);
    const show = shouldShowFirstOpenInvite({
      online,
      inviteCode: trip.inviteCode,
      alreadyShown: storage.getBoolean(key) ?? false,
    });
    if (!show) return;
    presented.current = true;
    storage.set(key, true);
    sheetRef.current?.present();
  }, [trip, online]);

  return sheetRef;
}
