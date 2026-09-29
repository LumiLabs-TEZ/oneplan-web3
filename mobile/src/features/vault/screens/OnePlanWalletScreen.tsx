/**
 * Port of `OnePlanWalletView.swift` (`origin/feat/web3-version`, Figma `4245:15020`) — personal
 * wallet detail: balance, withdraw/deposit actions, history.
 *
 * History is best-effort: a failed `GET /wallet/history` must never blank the balance already
 * shown (mirrors iOS's own comment — the endpoint existed on neither platform when this was
 * written, so the empty state is intentional, not a bug to fix here).
 *
 * Deposit is Wave A's flow (`DepositToOnePlanWalletView`/`DepositOptionsSheet`) — this screen
 * only exposes an `onDeposit` callback, the same seam `OnePlanWalletCard` uses.
 */
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { CurrencyFormatter } from '@/lib/currency';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { useWallet, useWalletHistory } from '../api/queries';
import { OnePlanWalletHistoryRow } from '../components/OnePlanWalletHistoryRow';
import { VaultHeaderChip } from '../components/VaultHeaderChip';
import { VaultSkyGradient } from '../components/VaultSkyGradient';

/** Indicative only — same ballpark as trip vault UX until live FX is wired. */
const INDICATIVE_USDC_TO_VND = 26_500;

export interface OnePlanWalletScreenProps {
  onBack: () => void;
  onWithdraw: () => void;
  onDeposit: () => void;
}

export function OnePlanWalletScreen({ onBack, onWithdraw, onDeposit }: OnePlanWalletScreenProps) {
  useAppLanguage();
  const { t } = useTranslation();

  const walletQuery = useWallet();
  const historyQuery = useWalletHistory();

  const balanceMicro = walletQuery.data ? BigInt(walletQuery.data.balanceMicro) : 0n;
  const balanceUsdc = Number(balanceMicro) / 1_000_000;
  const balanceVnd = balanceUsdc * INDICATIVE_USDC_TO_VND;
  const isLoading = walletQuery.isLoading;
  const history = historyQuery.data ?? [];

  return (
    <View style={styles.container}>
      <VaultSkyGradient height={345} />

      <ScrollView contentContainerStyle={styles.scrollContent} scrollIndicatorInsets={{ right: 1 }}>
        <View style={styles.balanceBlock}>
          {isLoading ? (
            <ActivityIndicator size="large" />
          ) : (
            <>
              <View style={styles.usdRow}>
                <Text style={styles.usdSymbol}>$</Text>
                <Text style={styles.usdAmount} numberOfLines={1}>
                  {formatUsd(balanceUsdc)}
                </Text>
              </View>
              <Text style={styles.vndAmount}>{CurrencyFormatter.formatWhole(balanceVnd)} VND</Text>
            </>
          )}
        </View>

        <View style={styles.actionButtons}>
          <Pressable
            onPress={onWithdraw}
            style={styles.withdrawButton}
            testID="wallet-screen-withdraw"
          >
            <Text style={styles.withdrawLabel}>{t('Withdraw')}</Text>
          </Pressable>
          <Pressable
            onPress={onDeposit}
            style={styles.depositButton}
            testID="wallet-screen-deposit"
          >
            <Text style={styles.depositLabel}>{t('Deposit')}</Text>
          </Pressable>
        </View>

        <View style={styles.historyCard}>
          {history.length === 0 ? (
            <Text style={styles.emptyText}>{t('No activity yet')}</Text>
          ) : (
            history.map((entry, index) => (
              <View key={entry.id}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <OnePlanWalletHistoryRow
                  entry={{
                    id: entry.id,
                    kind: entry.kind === 'withdraw' ? 'withdraw' : 'deposit',
                    address: entry.address,
                    amountUsdc: Number(entry.amountMicro) / 1_000_000,
                    time: formatTime(entry),
                  }}
                />
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <View style={styles.backChrome}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t('Back')}>
          <VaultHeaderChip>
            <View style={styles.backIconWrap}>
              <Ionicons name="arrow-back" size={14} color={colors.neutral900} />
            </View>
          </VaultHeaderChip>
        </Pressable>
        <Pressable onPress={onBack} accessibilityRole="button">
          <VaultHeaderChip>
            <View style={styles.backTextWrap}>
              <Text style={styles.backText}>{t('Back')}</Text>
            </View>
          </VaultHeaderChip>
        </Pressable>
      </View>
    </View>
  );
}

function formatUsd(value: number): string {
  return value === Math.floor(value) ? value.toFixed(0) : value.toFixed(2);
}

function formatTime(entry: { createdAt: string; blockTime: string }): string {
  const fromIso = new Date(entry.createdAt);
  if (!Number.isNaN(fromIso.getTime()) && entry.createdAt !== '') {
    return `${String(fromIso.getHours()).padStart(2, '0')}:${String(fromIso.getMinutes()).padStart(2, '0')}`;
  }
  const seconds = Number(entry.blockTime);
  if (Number.isFinite(seconds) && seconds > 0) {
    const date = new Date(seconds * 1000);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  return '—';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  scrollContent: { paddingTop: 280, paddingHorizontal: 16, paddingBottom: 24 },
  balanceBlock: { alignItems: 'flex-start', gap: 8 },
  usdRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  usdSymbol: { ...beVietnamPro(48), letterSpacing: -0.96, color: colors.contentL },
  usdAmount: { ...beVietnamPro(48), letterSpacing: -0.96, color: colors.contentB },
  vndAmount: { ...beVietnamPro(16), letterSpacing: -0.64, color: colors.neutral600 },
  actionButtons: { flexDirection: 'row', gap: 6, paddingTop: 8, paddingBottom: 12 },
  withdrawButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
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
  historyCard: {
    marginTop: 16,
    padding: 4,
    borderRadius: 24,
    backgroundColor: colors.neutral50,
  },
  emptyText: {
    ...beVietnamPro(14),
    color: colors.contentM,
    textAlign: 'center',
    paddingVertical: 28,
    paddingHorizontal: 10,
  },
  divider: { height: 1, backgroundColor: colors.neutral100 },
  backChrome: { position: 'absolute', top: 8, left: 16, flexDirection: 'row', gap: 5 },
  backIconWrap: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backTextWrap: { width: 61, height: 34, alignItems: 'center', justifyContent: 'center' },
  backText: { ...beVietnamPro(15), letterSpacing: -0.3, color: colors.neutral900 },
});
