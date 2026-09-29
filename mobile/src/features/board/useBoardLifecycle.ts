import { useEffect, useRef } from 'react';
import { AppState, InteractionManager } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { nativeApplicationVersion } from 'expo-application';
import { useAuthStore } from '@/auth/authStore';
import { useMe } from '@/features/me/useMe';
import { queryClient } from '@/api/queryClient';
import { keys } from '@/api/keys';
import { extractionService } from '@/sse/extractionService';
import { initializeAds, resetAdsSession } from '@/native/ads/ads';
import { reportAppLaunch } from './api/credits';

/** Launch-time ads start (UMP consent → ATT → SDK init) waits this long after interactions settle. */
const ADS_START_DELAY_MS = 2000;

export function useBoardLifecycle(ready: boolean) {
  const status = useAuthStore((s) => s.status);
  const userId = useMe().data?.id;
  const reported = useRef<number | null>(null);
  useEffect(() => {
    if (!ready || status !== 'authed' || !userId) {
      extractionService.reset();
      return;
    }
    let live = true;
    const foreground = (deferAds = false) => {
      if (AppState.currentState !== 'active' || !onlineManager.isOnline()) return;
      void extractionService.refresh();
      if (!deferAds) void initializeAds();
      if (nativeApplicationVersion && reported.current !== userId) {
        reported.current = userId;
        void reportAppLaunch(nativeApplicationVersion)
          .then(() => {
            if (live) void queryClient.invalidateQueries({ queryKey: keys.scanCredits.balance });
          })
          .catch(() => {
            if (live) reported.current = null;
          });
      }
    };
    foreground(true);
    // The first ads start (consent + ATT prompts, SDK init, three preloads) is pushed past the
    // first screen's frames. Later foreground/online triggers call it directly — a no-op once
    // initialized, and the delayed call below is likewise a no-op if one of them won the race.
    let adsTimer: ReturnType<typeof setTimeout> | undefined;
    const adsTask = InteractionManager.runAfterInteractions(() => {
      adsTimer = setTimeout(() => {
        if (live && AppState.currentState === 'active' && onlineManager.isOnline()) {
          void initializeAds();
        }
      }, ADS_START_DELAY_MS);
    });
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') foreground();
      else extractionService.detach();
    });
    const offOnline = onlineManager.subscribe((online) => {
      if (online) foreground();
      else extractionService.detach();
    });
    return () => {
      live = false;
      adsTask.cancel();
      clearTimeout(adsTimer);
      app.remove();
      offOnline();
      extractionService.reset();
      resetAdsSession();
      reported.current = null;
    };
  }, [ready, status, userId]);
}
