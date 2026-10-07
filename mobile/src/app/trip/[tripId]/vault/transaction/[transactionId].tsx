/**
 * Full-screen receipt for one vault history row (`VaultHistoryView` tap): a payment shows
 * `VaultTransactionDetailScreen`, a deposit shows `VaultDepositResultScreen` built from the
 * history entry. The edit sheet the payment receipt hosts needs its own portal host inside this
 * modal, not the root's (same as `vault/pay`).
 */
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTripDetail } from '@/features/trip/TripDetailContext';
import { useVaultHistory, useVaultTransaction } from '@/features/vault/api/queries';
import { depositFlowFromHistory } from '@/features/vault/screens/historyGrouping';
import { mapVaultTransactionDetail } from '@/features/vault/screens/transactionDetailMapping';
import { VaultDepositResultScreen } from '@/features/vault/screens/VaultDepositResultScreen';
import { VaultTransactionDetailScreen } from '@/features/vault/screens/VaultTransactionDetailScreen';
import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export default function VaultTransactionRoute() {
  useAppLanguage();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{
    tripId: string;
    transactionId: string;
    readOnly?: string;
  }>();
  const tripId = Number(params.tripId);
  const transactionId = Number(params.transactionId);
  const insets = useSafeAreaInsets();
  const detail = useTripDetail();

  const history = useVaultHistory(tripId);
  const entry = history.data?.find((e) => e.id === transactionId);
  const isSpend = entry?.kind === 'SPEND';
  const receipt = useVaultTransaction(tripId, isSpend ? transactionId : null, {
    enabled: isSpend,
  });
  const close = () => router.back();

  if (entry?.kind === 'DEPOSIT') {
    return (
      <VaultDepositResultScreen
        flow={depositFlowFromHistory(entry)}
        onDone={close}
        addressLabel={t('From')}
        showsDepositAgain={false}
      />
    );
  }

  if (isSpend && receipt.data) {
    return (
      <BottomSheetModalProvider>
        <VaultTransactionDetailScreen
          detail={mapVaultTransactionDetail(receipt.data, entry.title ?? '')}
          tripId={tripId}
          vaultTransactionId={transactionId}
          members={detail.members}
          allowsEditing={detail.access.canEdit && params.readOnly !== '1'}
          onBack={close}
          onApproved={close}
          onCancelled={close}
          topInset={insets.top}
        />
      </BottomSheetModalProvider>
    );
  }

  const failed = history.isError || receipt.isError || (!history.isLoading && (!entry || !isSpend));
  return (
    <View style={styles.center} testID="vault-transaction-loading">
      {failed ? (
        <>
          <Text style={styles.error}>{t('Could not load history')}</Text>
          <Pressable onPress={close} accessibilityRole="button" style={styles.back}>
            <Text style={styles.backLabel}>{t('Go back')}</Text>
          </Pressable>
        </>
      ) : (
        <ActivityIndicator />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: colors.background,
  },
  error: { ...beVietnamPro(16), color: colors.contentM },
  back: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: colors.neutral900,
  },
  backLabel: { ...beVietnamPro(17, 'regular'), color: colors.white },
});
