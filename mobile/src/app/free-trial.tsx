import { useEffect } from 'react';
import { track } from '@/analytics/track';
import { markRootModalDismissed } from '@/features/shell/rootModals';
import { useFreeTrial } from '@/features/subscription/useFreeTrial';
import { FreeTrialContent } from '@/features/subscription/components/FreeTrialContent';

export default function FreeTrialScreen() {
  const trial = useFreeTrial();
  useEffect(() => {
    track('SUBSCRIPTION_VIEWED');
  }, []);
  useEffect(() => () => markRootModalDismissed('freeTrial'), []);
  return <FreeTrialContent {...trial} />;
}
