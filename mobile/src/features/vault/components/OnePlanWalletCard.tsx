/**
 * Port of `OnePlanWalletCard.swift` (`origin/feat/web3-version`, Figma `4245:15486`) — the
 * personal OnePlan Wallet summary card shown above `ProfileInfoCard`.
 *
 * Header tap copies the wallet address (haptic + a brief "Copied" label); balance tap opens the
 * wallet detail; Withdraw/Deposit open sheets directly — four independent actions, not one drill-in.
 */
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { CurrencyFormatter } from '@/lib/currency';
import { svg } from '@/ui/assets';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const DepositOptionWalletIcon = svg.vault.depositOptionWallet;

export interface OnePlanWalletCardProps {
  /** Solana public key of the personal wallet; `null` while it is not linked yet. */
  address: string | null;
  balanceUsdc: number;
  balanceVnd: number;
  isLoading?: boolean;
  onOpenDetail?: () => void;
  onWithdraw?: () => void;
  onDeposit?: () => void;
  testID?: string;
}

export function OnePlanWalletCard({
  address,
  balanceUsdc,
  balanceVnd,
  isLoading = false,
  onOpenDetail,
  onWithdraw,
  onDeposit,
  testID,
}: OnePlanWalletCardProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const copyAddress = () => {
    if (!address) return;
    void Clipboard.setStringAsync(address);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={styles.card} testID={testID}>
      <Pressable
        onPress={copyAddress}
        disabled={!address}
        accessibilityRole="button"
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
        testID={testID ? `${testID}-copy` : undefined}
      >
        <View style={styles.headerIconFallback}>
          <DepositOptionWalletIcon width={24} height={24} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.headerLabel}>
            {copied ? t('Copied successfully') : t('OnePlan Wallet')}
          </Text>
          <Text style={styles.headerAddress} numberOfLines={1}>
            {address ? shortAddress(address) : '—'}
          </Text>
        </View>
      </Pressable>

      <Pressable
        onPress={onOpenDetail}
        style={styles.body}
        testID={testID ? `${testID}-open` : undefined}
      >
        <View style={styles.balanceBlock}>
          {isLoading ? (
            <ActivityIndicator />
          ) : (
            <>
              <View style={styles.usdRow}>
                <Text style={styles.usdSymbol}>$</Text>
                <Text style={styles.usdAmount}>{formatUsd(balanceUsdc)}</Text>
              </View>
              <Text style={styles.vndAmount}>{CurrencyFormatter.formatWhole(balanceVnd)} VND</Text>
            </>
          )}
        </View>
      </Pressable>

      <View style={styles.buttons}>
        <Pressable
          onPress={onWithdraw}
          style={styles.withdrawButton}
          testID={testID ? `${testID}-withdraw` : undefined}
        >
          <Text style={styles.withdrawLabel}>{t('Withdraw')}</Text>
        </Pressable>
        <Pressable
          onPress={onDeposit}
          style={styles.depositButton}
          testID={testID ? `${testID}-deposit` : undefined}
        >
          <Text style={styles.depositLabel}>{t('Deposit')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** `8nt5E...FKP7W` — first and last 5 characters of the address. */
function shortAddress(address: string): string {
  return address.length <= 10 ? address : `${address.slice(0, 5)}...${address.slice(-5)}`;
}

/** Whole dollars when exact; otherwise two decimal places (Swift `usdAmountText`). */
function formatUsd(value: number): string {
  return value === Math.floor(value) ? value.toFixed(0) : value.toFixed(2);
}

const styles = StyleSheet.create({
  card: {
    minHeight: 220,
    backgroundColor: colors.white,
    borderRadius: 24,
    boxShadow: '0px 0px 8.95px rgba(0, 0, 0, 0.05)',
  },
  body: { alignItems: 'center' },
  pressed: { opacity: 0.6 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral100,
  },
  headerIconFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(189, 189, 189, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: 1 },
  headerLabel: { ...beVietnamPro(14), letterSpacing: -0.42, color: 'rgba(54, 54, 54, 0.4)' },
  headerAddress: { ...beVietnamPro(18), letterSpacing: -0.54, color: colors.neutral950 },
  balanceBlock: { alignItems: 'center', gap: 5, paddingHorizontal: 16, paddingVertical: 12 },
  usdRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  usdSymbol: { ...beVietnamPro(36), letterSpacing: -0.72, color: colors.contentL },
  usdAmount: { ...beVietnamPro(36), letterSpacing: -0.72, color: colors.contentB },
  vndAmount: { ...beVietnamPro(14), letterSpacing: -0.56, color: colors.neutral600 },
  buttons: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
  },
  withdrawButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 6px 12px rgba(0, 0, 0, 0.07), 0px 10px 18px rgba(204, 219, 240, 0.35)',
  },
  withdrawLabel: { ...beVietnamPro(15), letterSpacing: -0.75, color: colors.contentB },
  depositButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 999,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  depositLabel: { ...beVietnamPro(15), letterSpacing: -0.6, color: colors.white },
});
