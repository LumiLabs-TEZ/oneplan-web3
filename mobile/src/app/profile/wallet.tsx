/**
 * Personal OnePlan Wallet detail — pushed from `ProfileView`'s `OnePlanWalletCard`.
 * Port of `View/Wallet/OnePlanWalletView.swift`.
 */
import { router } from 'expo-router';
import { useRef } from 'react';

import { OnePlanWalletScreen } from '@/features/vault/screens/OnePlanWalletScreen';
import {
  WalletWithdrawSheetHost,
  type WalletWithdrawSheetHostRef,
} from '@/features/vault/screens/WalletWithdrawSheetHost';

export default function ProfileWalletScreen() {
  const withdrawSheetRef = useRef<WalletWithdrawSheetHostRef>(null);

  return (
    <>
      <OnePlanWalletScreen
        onBack={() => router.back()}
        onWithdraw={() => withdrawSheetRef.current?.present()}
        onDeposit={() => router.push('/wallet/deposit')}
      />
      <WalletWithdrawSheetHost ref={withdrawSheetRef} />
    </>
  );
}
