import { router } from 'expo-router';
import { useEffect } from 'react';

import { WelcomeTripWalletSheet } from '@/features/vault/screens/WelcomeTripWalletSheet';
import { markRootModalDismissed } from '@/features/shell/rootModals';

export default function Web3WelcomeRoute() {
  // Swiping the sheet away skips `dismiss`; release the presenter window on unmount either way.
  useEffect(() => () => markRootModalDismissed('web3Welcome'), []);

  const dismiss = () => {
    markRootModalDismissed('web3Welcome');
    router.back();
  };

  // TODO(wave-c): route through Profile → Wallet → Deposit once the Profile wallet card exists
  // (ProfileView.swift's OnePlanWalletCard, Wave C). Until then this goes straight to the
  // deposit sheet, matching the functional outcome but skipping the intermediate Profile push.
  const addMoney = () => {
    markRootModalDismissed('web3Welcome');
    router.replace('/wallet/deposit');
  };

  return <WelcomeTripWalletSheet onContinue={dismiss} onAddMoney={addMoney} />;
}
