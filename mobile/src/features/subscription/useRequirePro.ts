/**
 * Imperative Pro gate for actions that aren't wrapped by `PremiumGate` (e.g. a handler that also
 * needs to do other work once access is confirmed). `requirePro` navigates to `/paywall` when the
 * caller isn't Pro; otherwise it runs `onAllowed`.
 */
import { router } from 'expo-router';
import { useCallback } from 'react';

import { useIsPro } from './api/queries';

export interface UseRequireProResult {
  isPro: boolean;
  requirePro: (onAllowed: () => void) => void;
}

export function useRequirePro(): UseRequireProResult {
  const isPro = useIsPro();

  const requirePro = useCallback(
    (onAllowed: () => void) => {
      if (!isPro) {
        router.push('/paywall');
        return;
      }
      onAllowed();
    },
    [isPro],
  );

  return { isPro, requirePro };
}
