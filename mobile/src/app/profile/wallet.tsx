/**
 * Personal OnePlan Wallet detail — pushed from `ProfileView`'s `OnePlanWalletCard` (and the
 * Settings "My wallet" row). Port of `View/Wallet/OnePlanWalletView.swift`.
 */
import { router } from 'expo-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { OnePlanWalletScreen } from '@/features/vault/screens/OnePlanWalletScreen';
import { WalletWithdrawSheet } from '@/features/vault/screens/WalletWithdrawSheet';
import { useAppLanguage } from '@/i18n';
import { AppSheet, type AppSheetRef } from '@/ui/components';

export default function ProfileWalletScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const withdrawSheetRef = useRef<AppSheetRef>(null);

  return (
    <>
      <OnePlanWalletScreen
        onBack={() => router.back()}
        onWithdraw={() => withdrawSheetRef.current?.present()}
        onDeposit={() =>
          // Deposit is Wave A's flow (`DepositToOnePlanWalletView`/`DepositOptionsSheet`, not
          // part of this task) — placeholder until that lands.
          Alert.alert(t('Deposit'), t('Coming soon'))
        }
      />
      <AppSheet
        ref={withdrawSheetRef}
        snapPoints={['94%']}
        floating={false}
        enableDynamicSizing={false}
      >
        <WalletWithdrawSheet onFinished={() => withdrawSheetRef.current?.dismiss()} />
      </AppSheet>
    </>
  );
}
