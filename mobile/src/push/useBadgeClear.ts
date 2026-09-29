import { setBadgeCountAsync } from 'expo-notifications';
import { useEffect } from 'react';
import { AppState } from 'react-native';
/** Clearing a badge must never prompt for notification permission. */
export function useBadgeClear() {
  useEffect(() => {
    const clear = () => {
      void setBadgeCountAsync(0).catch(() => undefined);
    };
    clear();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') clear();
    });
    return () => subscription.remove();
  }, []);
}
