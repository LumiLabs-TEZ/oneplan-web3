/**
 * Post-end Settlement tab for vault trips — port of
 * `ios/OnePlan/OnePlan/View/Vault/VaultSettlementView.swift`. Figma `4013:13084` / `4013:12968`.
 *
 * Cash debts that involve the caller, after the vault has wound itself up on chain: expandable
 * receive/pay rows, Mark as done, Show QR (the wallet's Receive QR), and Pay — the withdraw sheet
 * prefilled with the creditor's linked wallet and the debt amount.
 */
import { router } from 'expo-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { TripEndHeroHeader } from '@/features/settlement/components/TripEndHeroHeader';
import { useExchangeRate } from '@/features/exchange/useExchangeRate';
import type { TripMemberDto } from '@/features/trip/types';
import { useConfirmVaultCashDebt, type CashDebtDto } from '@/features/vault/api/endTrip';
import { useMemberIdentities } from '@/features/vault/api/mwa';
import { useVaultSettlement } from '@/features/vault/api/queries';
import { VaultSettlementRow } from '@/features/vault/components/VaultSettlementRow';
import {
  FALLBACK_USDC_TO_VND,
  avatarUrlFor,
  mapCashDebtToEntry,
} from '@/features/vault/helpers/tripEndSettlement';
import {
  WalletWithdrawSheetHost,
  type WalletWithdrawSheetHostRef,
} from '@/features/vault/screens/WalletWithdrawSheetHost';
import { useAppLanguage } from '@/i18n';
import type { Currency } from '@/lib/currency';
import { EmptyState, Spinner } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface VaultSettlementScreenProps {
  tripId: number;
  coverImageUrl?: string | null;
  totalSpent: number;
  currency: Currency;
  members: readonly TripMemberDto[];
  myUserId: number | undefined;
}

function pairKey(debt: CashDebtDto): string {
  return `${debt.fromUserId}-${debt.toUserId}`;
}

export function VaultSettlementScreen({
  tripId,
  coverImageUrl,
  totalSpent,
  currency,
  members,
  myUserId,
}: VaultSettlementScreenProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const settlement = useVaultSettlement(tripId);
  const confirm = useConfirmVaultCashDebt(tripId);
  // Non-blocking overlay: rows render unchanged while it loads or errors.
  const identities = useMemberIdentities(tripId);
  const rate = useExchangeRate('USD', 'VND');
  const usdcToVnd = rate.data?.rate && rate.data.rate > 0 ? rate.data.rate : FALLBACK_USDC_TO_VND;

  const preview = settlement.data;
  const myDebts = (preview?.cashDebts ?? []).filter(
    (debt) => debt.fromUserId === myUserId || debt.toUserId === myUserId,
  );
  const unsettledCount = myDebts.filter((debt) => !debt.isConfirmed).length;

  const handleConfirm = (fromUserId: number) => {
    confirm.mutate(fromUserId, {
      onError: () => Alert.alert(t('Settlement failed')),
    });
  };

  const withdrawRef = useRef<WalletWithdrawSheetHostRef>(null);
  const handleShowQR = () =>
    router.push({ pathname: '/wallet/deposit', params: { mode: 'receive' } });
  // Send only exists when the caller owes and the creditor has linked a wallet.
  const handleSendToWallet = (debt: CashDebtDto) => {
    if (!debt.toWalletAddress) return;
    withdrawRef.current?.present({
      address: debt.toWalletAddress,
      amountMicro: BigInt(debt.amountMicro),
    });
  };

  return (
    <View style={styles.root} testID="vault-settlement-screen">
      <TripEndHeroHeader
        coverImageUrl={coverImageUrl}
        totalSpent={totalSpent}
        unsettledCount={unsettledCount}
        currency={currency}
      />

      {!preview ? (
        settlement.isError ? (
          <View style={styles.rows} testID="vault-settlement-error">
            <EmptyState
              title={t('Could not load settlement')}
              action={{ label: t('Retry'), onPress: () => void settlement.refetch() }}
            />
          </View>
        ) : (
          <Spinner style={styles.spinner} />
        )
      ) : !preview.isSettled ? (
        <Text style={styles.settlingBanner}>{t('Settling the trip fund…')}</Text>
      ) : myDebts.length === 0 ? (
        <Text style={styles.emptyText}>{t('Nothing left to settle in cash')}</Text>
      ) : (
        <View style={styles.rows}>
          {myDebts.map((debt) => {
            const entry = mapCashDebtToEntry(
              debt,
              myUserId ?? 0,
              usdcToVnd,
              avatarUrlFor(members, debt.toUserId === myUserId ? debt.fromUserId : debt.toUserId),
            );
            return (
              <VaultSettlementRow
                key={pairKey(debt)}
                entry={entry}
                identity={identities.data?.get(entry.id)}
                isWorking={confirm.isPending && confirm.variables === debt.fromUserId}
                onMarkAsDone={() => handleConfirm(debt.fromUserId)}
                onShowQR={handleShowQR}
                onSendToWallet={() => handleSendToWallet(debt)}
              />
            );
          })}
        </View>
      )}

      <WalletWithdrawSheetHost ref={withdrawRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm, paddingBottom: spacing.xxl },
  rows: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  spinner: { minHeight: 200 },
  settlingBanner: {
    ...beVietnamPro(14),
    color: colors.contentM,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  emptyText: {
    ...beVietnamPro(14),
    color: colors.contentM,
    textAlign: 'center',
    paddingTop: spacing.md,
  },
});
