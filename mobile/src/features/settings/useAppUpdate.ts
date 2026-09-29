/**
 * On-demand EAS Update: check → download → reload. By default expo-updates only applies a
 * downloaded update on the next cold start; this restarts into it immediately.
 */
import * as Updates from 'expo-updates';
import { useRef, useState } from 'react';

import type { AppUpdateStatus } from './helpers/appUpdate';

export function useAppUpdate() {
  const [status, setStatus] = useState<AppUpdateStatus>('idle');
  const running = useRef(false);

  const check = async () => {
    if (running.current) return;
    if (!Updates.isEnabled) {
      setStatus('unavailable');
      return;
    }
    running.current = true;
    try {
      setStatus('checking');
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        setStatus('upToDate');
        return;
      }
      setStatus('downloading');
      await Updates.fetchUpdateAsync();
      setStatus('restarting');
      await Updates.reloadAsync();
    } catch {
      setStatus('error');
    } finally {
      running.current = false;
    }
  };

  return { status, check };
}
