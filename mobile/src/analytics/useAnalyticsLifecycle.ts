import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAuthStore } from '@/auth/authStore';

import { getAnalyticsClient } from './client';

/**
 * Mount once in the root layout. Drives the analytics session from AppState
 * (`active` → foreground/resolve, `background|inactive` → background/end) and
 * from auth changes (login → register the session, sign-out → drop the id).
 */
export function useAnalyticsLifecycle(): void {
  useEffect(() => {
    const client = getAnalyticsClient();
    // The root layout mounts while the app is (becoming) active, so treat the
    // initial state as foreground regardless of what AppState reports.
    let last: AppStateStatus = 'active';
    client.onForeground();

    const appState = AppState.addEventListener('change', (next) => {
      const wasActive = last === 'active';
      last = next;
      if (next === 'active') {
        if (!wasActive) client.onForeground();
      } else if (wasActive) {
        client.onBackground();
      }
    });

    const unsubscribeAuth = useAuthStore.subscribe((state, prev) => {
      if (state.status !== prev.status) client.onAuthChanged(state.status);
    });

    return () => {
      appState.remove();
      unsubscribeAuth();
    };
  }, []);
}
