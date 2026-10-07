/**
 * Full-screen withdraw receipt, opened by `WalletWithdrawSheetHost` once the withdraw is sent.
 */
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WalletWithdrawResultScreen } from '@/features/vault/screens/WalletWithdrawResultScreen';
import { useWalletWithdrawResultStore } from '@/features/vault/walletWithdrawResultStore';

export default function WalletWithdrawResultRoute() {
  const insets = useSafeAreaInsets();
  const result = useWalletWithdrawResultStore((s) => s.result);
  if (!result) return null;
  return (
    <WalletWithdrawResultScreen
      result={result}
      topInset={insets.top}
      onDone={() => router.back()}
      onSendAgain={() => {
        useWalletWithdrawResultStore.getState().requestSendAgain();
        router.back();
      }}
    />
  );
}
