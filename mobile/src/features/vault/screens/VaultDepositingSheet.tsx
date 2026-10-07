/**
 * Port of `VaultDepositingSheet.swift` (`origin/feat/web3-version`, Figma `4539:34723`).
 * Deposit sheet shown while the chain confirms (spinner) and, once it lands, in place as the
 * success state (green check + Done). Purely presentational — the real state machine lives in
 * `TripVaultSection`, which feeds `status` from `vaultDepositFlowStore`.
 */
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { SFSymbol } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { formatMicroUsdc } from '../depositMath';
import { shortenAddress } from '../shortenAddress';
import type { VaultDepositStatus } from '../vaultDepositFlowStore';

const SUCCESS_GREEN = '#30C48C';

export interface VaultDepositingSheetProps {
  amountMicro: bigint;
  fromAddress: string;
  toAddress: string;
  status: VaultDepositStatus;
  onDetails: () => void;
  onDone: () => void;
}

/** Figma truncates as `9RqQ...DzQi` (4 + 4), and shows anything up to 8 characters whole. */
export function shortenVaultAddress(address: string): string {
  return shortenAddress(address, 8);
}

export function VaultDepositingSheet({
  amountMicro,
  fromAddress,
  toAddress,
  status,
  onDetails,
  onDone,
}: VaultDepositingSheetProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const amountText = `$${formatMicroUsdc(amountMicro)}`;
  const isCompleted = status === 'completed';

  useEffect(() => {
    if (!isCompleted) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  }, [isCompleted]);

  return (
    <View style={styles.root} testID="vault-depositing-sheet">
      <View style={styles.body}>
        <View
          style={styles.icon}
          testID={isCompleted ? 'vault-depositing-success' : 'vault-depositing-loading'}
        >
          {isCompleted ? (
            <SFSymbol
              name="checkmark.circle.fill"
              fallback="checkmark-circle"
              size={44}
              color={SUCCESS_GREEN}
            />
          ) : (
            <ActivityIndicator size="large" color={colors.neutral900} />
          )}
        </View>
        <View style={styles.texts}>
          {isCompleted ? <Text style={styles.title}>{t('Deposit complete')}</Text> : null}
          <Text style={styles.amount}>{amountText}</Text>
          <Text style={styles.description}>
            {isCompleted
              ? t('You deposited {{0}} from your OnePlan Wallet to TripFund.', { 0: amountText })
              : t(
                  "You're depositing {{0}} from your OnePlan Wallet to TripFund. Please wait a few seconds.",
                  { 0: amountText },
                )}
          </Text>
        </View>

        <View style={styles.addresses}>
          <AddressRow label={t('From')} value={shortenVaultAddress(fromAddress)} />
          <AddressRow label={t('To')} value={shortenVaultAddress(toAddress)} />
        </View>
      </View>

      {isCompleted ? (
        <View style={styles.actions}>
          <Pressable
            onPress={onDone}
            style={styles.primaryButton}
            accessibilityRole="button"
            testID="vault-depositing-done"
          >
            <Text style={styles.primaryText}>{t('Done')}</Text>
          </Pressable>
          <Pressable
            onPress={onDetails}
            style={styles.secondaryButton}
            accessibilityRole="button"
            testID="vault-depositing-details"
          >
            <Text style={styles.secondaryText}>{t('Details')}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable
            onPress={onDetails}
            style={styles.primaryButton}
            accessibilityRole="button"
            testID="vault-depositing-details"
          >
            <Text style={styles.primaryText}>{t('Details')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function AddressRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.addressRow}>
      <Text style={styles.addressLabel}>{label}</Text>
      <Text style={styles.addressValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16, paddingBottom: 48 },
  body: { alignItems: 'center', gap: 24, marginTop: 12 },
  icon: { height: 44, alignItems: 'center', justifyContent: 'center' },
  texts: { alignItems: 'center', gap: 4 },
  title: { ...beVietnamPro(17, 'medium'), letterSpacing: -0.51, color: colors.neutral950 },
  amount: { ...beVietnamPro(32), letterSpacing: -1.28, color: colors.neutral950 },
  description: {
    ...beVietnamPro(14),
    letterSpacing: -0.42,
    color: colors.contentM,
    textAlign: 'center',
  },
  addresses: { width: '100%', gap: 8, paddingHorizontal: 8 },
  addressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  addressLabel: { ...beVietnamPro(15), letterSpacing: -0.45, color: colors.contentM },
  addressValue: { ...beVietnamPro(16), letterSpacing: -0.48, color: '#393939' },
  actions: { marginTop: 16, gap: 8 },
  primaryButton: {
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: colors.neutral900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { ...beVietnamPro(17, 'regular'), letterSpacing: -0.68, color: colors.white },
  secondaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { ...beVietnamPro(17, 'regular'), letterSpacing: -0.68, color: colors.neutral900 },
});
