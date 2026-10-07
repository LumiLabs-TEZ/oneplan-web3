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
import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiMutationError, mutationErrorMessage } from '@/api/mutationError';
import { useAppLanguage } from '@/i18n';
import { CurrencyFormatter } from '@/lib/currency';
import { BackPillButton } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { useWeb3Eligibility } from '../api/eligibility';
import { useClaimFaucet } from '../api/mwa';
import { useWallet, useWalletHistory } from '../api/queries';
import { ConnectWalletCard } from '../components/ConnectWalletCard';
import { OnePlanWalletHistoryRow } from '../components/OnePlanWalletHistoryRow';
import { VaultSkyGradient } from '../components/VaultSkyGradient';

/** Indicative only — same ballpark as trip vault UX until live FX is wired. */
const INDICATIVE_USDC_TO_VND = 26_500;

const SKY_TO_WHITE = ['rgb(180, 223, 255)', 'rgb(251, 236, 215)', colors.white] as const;

/** How long the faucet result stays under the button (same timer pattern as the wallet card's "Copied"). */
const FAUCET_MESSAGE_MS = 4000;

/**
 * Faucet failure text, or null to say nothing: 409 `faucet_in_flight` is a double tap while the
 * first claim is still running — that claim's own result is what the member should see.
 */
function faucetErrorMessage(t: TFunction, error: unknown): string | null {
  if (error instanceof ApiMutationError) {
    const code = (error.body as { code?: string } | null)?.code;
    if (error.status === 409 && code === 'faucet_in_flight') return null;
    if (error.status === 429) return t('You can claim test USDC again tomorrow.');
    // `faucet_empty`, and `faucet_wrong_cluster` (misconfigured server) — unavailable either way.
    if (error.status === 503) return t('The test faucet is empty right now.');
    if (error.status === 400 && code === 'wallet_not_linked') {
      return t('Connect your Solana wallet');
    }
  }
  return mutationErrorMessage(error, t('Something went wrong'));
}

export interface OnePlanWalletScreenProps {
  onBack: () => void;
  onWithdraw: () => void;
  onDeposit: () => void;
}

export function OnePlanWalletScreen({ onBack, onWithdraw, onDeposit }: OnePlanWalletScreenProps) {
  useAppLanguage();
  const { t } = useTranslation();

  const insets = useSafeAreaInsets();
  const walletQuery = useWallet();
  const historyQuery = useWalletHistory();
  const eligibility = useWeb3Eligibility();
  const faucet = useClaimFaucet();
  const showFaucet = eligibility.data?.faucetEnabled === true && !!walletQuery.data?.publicKey;
  const [faucetMessage, setFaucetMessage] = useState<string | null>(null);
  const faucetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (faucetTimer.current) clearTimeout(faucetTimer.current);
    },
    [],
  );

  const flashFaucetMessage = (message: string) => {
    setFaucetMessage(message);
    if (faucetTimer.current) clearTimeout(faucetTimer.current);
    faucetTimer.current = setTimeout(() => setFaucetMessage(null), FAUCET_MESSAGE_MS);
  };

  const claimTestUsdc = () =>
    faucet.mutate(undefined, {
      onSuccess: () => flashFaucetMessage(t('Test USDC sent')),
      onError: (error) => {
        const message = faucetErrorMessage(t, error);
        if (message !== null) flashFaucetMessage(message);
      },
    });

  const balanceMicro = walletQuery.data ? BigInt(walletQuery.data.balanceMicro) : 0n;
  const balanceUsdc = Number(balanceMicro) / 1_000_000;
  const balanceVnd = balanceUsdc * INDICATIVE_USDC_TO_VND;
  const isLoading = walletQuery.isLoading;
  const history = historyQuery.data ?? [];

  return (
    <View style={styles.container}>
      {/* Fades to the page's white, as Swift does — ending on the grey default left a band. */}
      <VaultSkyGradient height={345} colors={SKY_TO_WHITE} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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

        <ConnectWalletCard
          skrDomain={walletQuery.data?.skrDomain ?? null}
          isSeeker={walletQuery.data?.isSeeker ?? false}
          onConnected={() => void walletQuery.refetch()}
        />

        {showFaucet ? (
          <View style={styles.faucetBlock}>
            <Pressable
              onPress={claimTestUsdc}
              disabled={faucet.isPending}
              style={styles.faucetButton}
              testID="wallet-screen-faucet"
              accessibilityRole="button"
              accessibilityLabel={t('Get test USDC')}
              accessibilityState={{ busy: faucet.isPending, disabled: faucet.isPending }}
            >
              {faucet.isPending ? (
                <ActivityIndicator color={colors.contentB} />
              ) : (
                <Text style={styles.faucetLabel}>{t('Get test USDC')}</Text>
              )}
            </Pressable>
            {faucetMessage !== null ? (
              <Text style={styles.faucetStatus} testID="wallet-screen-faucet-status">
                {faucetMessage}
              </Text>
            ) : null}
          </View>
        ) : null}

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

      <View style={[styles.backChrome, { top: insets.top + 8 }]}>
        <BackPillButton onPress={onBack} testID="wallet-screen-back" />
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
  // Swift: balance inset 16, buttons + history inset 12.
  scrollContent: { paddingTop: 280, paddingHorizontal: 12, paddingBottom: 24 },
  balanceBlock: { alignItems: 'flex-start', gap: 8, paddingHorizontal: 4 },
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
    // Swift's two stacked shadows: a soft dark lift + a pale blue glow.
    boxShadow: '0px 6px 12px rgba(0, 0, 0, 0.07), 0px 10px 18px rgba(204, 219, 240, 0.35)',
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
  faucetBlock: { gap: 6, paddingTop: 12 },
  faucetButton: {
    minHeight: 42,
    borderRadius: 999,
    backgroundColor: colors.neutral50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faucetLabel: { ...beVietnamPro(15), letterSpacing: -0.6, color: colors.contentB },
  faucetStatus: { ...beVietnamPro(13), color: colors.contentM, textAlign: 'center' },
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
  backChrome: { position: 'absolute', left: 16 },
});
