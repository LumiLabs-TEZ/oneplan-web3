/**
 * Port of `OnePlanWalletHistoryRow.swift` (`origin/feat/web3-version`) — one personal-wallet
 * movement in `OnePlanWalletView`'s history list.
 */
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { images } from '@/ui/assets';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface OnePlanWalletHistoryEntry {
  id: string;
  kind: 'withdraw' | 'deposit';
  /** Counterparty wallet address (owner, not ATA), shown truncated. */
  address: string;
  /** Absolute USDC amount — sign comes from `kind`. */
  amountUsdc: number;
  time: string;
}

export interface OnePlanWalletHistoryRowProps {
  entry: OnePlanWalletHistoryEntry;
  testID?: string;
}

export function OnePlanWalletHistoryRow({ entry, testID }: OnePlanWalletHistoryRowProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const isWithdraw = entry.kind === 'withdraw';

  return (
    <View style={styles.row} testID={testID}>
      <Image
        source={isWithdraw ? images.vault.walletHistoryWithdraw : images.vault.walletHistoryDeposit}
        style={styles.icon}
        resizeMode="contain"
      />
      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {isWithdraw ? t('Withdraw USDC') : t('Deposit USDC')}
        </Text>
        <Text style={styles.address} numberOfLines={1}>
          {truncateAddress(entry.address)}
        </Text>
      </View>
      <View style={styles.trailing}>
        <Text
          style={[styles.amount, { color: isWithdraw ? colors.warning500 : colors.contentB }]}
          numberOfLines={1}
        >
          {amountText(entry)}
        </Text>
        <Text style={styles.time} numberOfLines={1}>
          {entry.time}
        </Text>
      </View>
    </View>
  );
}

function amountText(entry: OnePlanWalletHistoryEntry): string {
  const value =
    entry.amountUsdc === Math.floor(entry.amountUsdc)
      ? entry.amountUsdc.toFixed(0)
      : entry.amountUsdc.toFixed(2);
  return entry.kind === 'withdraw' ? `-$${value}` : `+$${value}`;
}

function truncateAddress(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 14,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.onSurface,
  },
  titleBlock: { flex: 1, gap: 3 },
  title: { ...beVietnamPro(16), letterSpacing: -0.64, color: colors.contentB },
  address: { ...beVietnamPro(14), letterSpacing: -0.28, color: colors.contentM },
  trailing: { alignItems: 'flex-end', gap: 3 },
  amount: { ...beVietnamPro(16), letterSpacing: -0.32 },
  time: { ...beVietnamPro(14), letterSpacing: -0.28, color: colors.contentM },
});
