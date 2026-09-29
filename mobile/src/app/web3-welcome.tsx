import { router } from 'expo-router';

import { WelcomeTripWalletSheet } from '@/features/vault/screens/WelcomeTripWalletSheet';
import { markRootModalDismissed } from '@/features/shell/rootModals';

export default function Web3WelcomeRoute() {
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

  return <WelcomeTripWalletSheet onContinue={dismiss} onClose={dismiss} onAddMoney={addMoney} />;
}
