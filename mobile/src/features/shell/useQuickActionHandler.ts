/**
 * Routes a FAB quick action — `MainView.handleQuickAction` + the `PremiumGate` on `uploadTrip`.
 * Shared by the native iOS tab bar (`onAction`) and the JS `QuickActionsMenu` rows.
 */
import { router } from 'expo-router';
import { useCallback } from 'react';

import { useIsPro } from '@/features/me/useMe';

import { type QuickActionKind, resolveQuickAction } from './quickActions';

export function useQuickActionHandler({
  onClose,
  planningTripCount = 0,
}: {
  onClose: () => void;
  planningTripCount?: number;
}) {
  const isPro = useIsPro();

  return useCallback(
    (action: QuickActionKind) => {
      onClose();
      const outcome = resolveQuickAction(action, { isPro, planningTripCount });
      if (outcome.type === 'paywall') {
        router.push('/paywall');
        return;
      }
      if (action === 'newTrip') {
        router.push('/trip/new');
        return;
      }
      if (action === 'scanQR') {
        router.push({ pathname: '/profile/invite', params: { scan: '1' } });
        return;
      }
      router.push('/market/editor');
    },
    [isPro, onClose, planningTripCount],
  );
}
