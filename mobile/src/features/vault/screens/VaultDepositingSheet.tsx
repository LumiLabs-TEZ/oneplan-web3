/**
 * Port of `VaultDepositingSheet.swift` (`origin/feat/web3-version`, Figma `4539:34723`).
 * In-flight deposit wait sheet, shown while the chain confirms. Purely presentational — the real
 * state machine lives in `TripVaultSection`.
 */
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import DepositContributeArrow from '@/assets/images/vault/depositContributeArrow.svg';
import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { formatMicroUsdc } from '../depositMath';
import { shortenAddress } from '../shortenAddress';

export interface VaultDepositingSheetProps {
  amountMicro: bigint;
  fromAddress: string;
  toAddress: string;
  onDetails: () => void;
}

/** Figma truncates as `9RqQ...DzQi` (4 + 4), and shows anything up to 8 characters whole. */
export function shortenVaultAddress(address: string): string {
  return shortenAddress(address, 8);
}

export function VaultDepositingSheet({
  amountMicro,
  fromAddress,
  toAddress,
  onDetails,
}: VaultDepositingSheetProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const amountText = `$${formatMicroUsdc(amountMicro)}`;

  return (
    <View style={styles.root} testID="vault-depositing-sheet">
      <View style={styles.body}>
        <DepositContributeArrow width={28} height={28} />
        <Text style={styles.amount}>{amountText}</Text>
        <Text style={styles.description}>
          {t(
            "You're depositing {{0}} from your OnePlan Wallet to TripFund. Please wait a few seconds.",
            { 0: amountText },
          )}
        </Text>

        <View style={styles.addresses}>
          <AddressRow label={t('From')} value={shortenVaultAddress(fromAddress)} />
          <AddressRow label={t('To')} value={shortenVaultAddress(toAddress)} />
        </View>
      </View>

      <Pressable onPress={onDetails} style={styles.detailsButton} accessibilityRole="button">
        <Text style={styles.detailsText}>{t('Details')}</Text>
      </Pressable>
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
  root: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 16, paddingBottom: 48 },
  body: { alignItems: 'center', gap: 24, marginTop: 12 },
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
  detailsButton: {
    marginTop: 16,
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: colors.neutral900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsText: { ...beVietnamPro(17, 'regular'), letterSpacing: -0.68, color: colors.white },
});
