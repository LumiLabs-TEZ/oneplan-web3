/**
 * Personal OnePlan Wallet QR. `mode=receive` is the settlement "Show QR" entry (a creditor showing
 * the debtor where to pay), same sheet with Receive copy — `DepositToOnePlanWalletView(mode:)`.
 */
import { useLocalSearchParams } from 'expo-router';

import { DepositToOnePlanWalletSheet } from '@/features/vault/screens/DepositToOnePlanWalletSheet';

export default function WalletDepositRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  return <DepositToOnePlanWalletSheet mode={mode === 'receive' ? 'receive' : 'deposit'} />;
}
