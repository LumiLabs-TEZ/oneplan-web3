/**
 * Port of `VaultDepositResultView.swift` (`origin/feat/web3-version`, Figma `4539:34858`
 * Processing / `4539:34954` Done). Reads the live `vaultDepositFlowStore` (see that file's header
 * for why this isn't route params) so the receipt updates Processing → Completed without
 * remounting or a new fetch.
 */
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { formatMicroUsdc } from '../depositMath';
import { shortenVaultAddress } from './VaultDepositingSheet';
import {
  useVaultDepositFlowStore,
  vaultDepositFlowStore,
  type VaultDepositFlow,
} from '../vaultDepositFlowStore';

const GREEN = '#30C48C';
const PROCESSING_ORANGE = '#FF8C40';

export interface VaultDepositResultScreenProps {
  flow?: VaultDepositFlow;
  onDone?: () => void;
  onDepositAgain?: () => void;
  /** Label for the address row — `Recipient` (the vault) after a deposit, `From` in history. */
  addressLabel?: string;
  /** False for a past deposit opened from history — "Deposit again" drives the live flow. */
  showsDepositAgain?: boolean;
}

export function VaultDepositResultScreen({
  flow: flowProp,
  onDone,
  onDepositAgain,
  addressLabel,
  showsDepositAgain = true,
}: VaultDepositResultScreenProps) {
  useAppLanguage();
  const { t } = useTranslation();
  // Presented as a full-screen modal route: the content clears the status bar itself.
  const insets = useSafeAreaInsets();
  const storedFlow = useVaultDepositFlowStore((s) => s.flow);
  const flow = flowProp ?? storedFlow;
  const done = onDone ?? (() => router.back());
  const depositAgain =
    onDepositAgain ??
    (() => {
      vaultDepositFlowStore.requestDepositAgain();
      router.back();
    });

  if (!flow) return null;

  const amountText = `$${formatMicroUsdc(flow.amountMicro)}`;
  const isCompleted = flow.status === 'completed';

  const copy = (value: string) => {
    void Clipboard.setStringAsync(value);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  };

  return (
    <View style={styles.root} testID="vault-deposit-result-screen">
      <LinearGradient
        colors={
          isCompleted
            ? ['rgba(180, 223, 255, 1)', 'rgba(251, 236, 215, 1)', colors.background]
            : ['rgba(255, 200, 180, 1)', 'rgba(251, 236, 215, 1)', colors.background]
        }
        locations={[0, 0.514, 1]}
        style={styles.gradient}
      />

      <View style={{ height: insets.top }} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.amountBlock}>
          <Text style={styles.amountLabel}>{t('Amount')}</Text>
          <Text style={styles.amountValue} numberOfLines={1}>
            {amountText}
          </Text>
        </View>

        <View style={styles.detailsShell}>
          <View style={styles.detailsCard}>
            <Row label={t('Status')}>
              <View style={styles.statusValue}>
                {isCompleted ? (
                  <View style={[styles.statusDot, { backgroundColor: GREEN }]} />
                ) : (
                  <View style={[styles.statusDot, { backgroundColor: PROCESSING_ORANGE }]} />
                )}
                <Text style={styles.value}>{isCompleted ? t('Completed') : t('Processing')}</Text>
              </View>
            </Row>
            <Row label={t('Date')}>
              <Text style={styles.value}>{formatDate(flow.date)}</Text>
            </Row>
            <Row label={addressLabel ?? t('Recipient')}>
              <Copyable
                display={shortenVaultAddress(flow.recipient)}
                full={flow.recipient}
                onCopy={copy}
              />
            </Row>
            <Row label={t('Transaction ID')}>
              {flow.signature ? (
                <Copyable
                  display={shortenVaultAddress(flow.signature)}
                  full={flow.signature}
                  onCopy={copy}
                />
              ) : (
                <Text style={styles.value}>{'…'}</Text>
              )}
            </Row>
            <Row label={t('Onchain fees')}>
              <Text style={styles.covered}>{t('Covered')}</Text>
            </Row>
            <Row label={t('Estimated gas fee')}>
              <Text style={styles.covered}>{t('Covered')}</Text>
            </Row>
          </View>

          {flow.signature ? (
            <Pressable
              onPress={() =>
                void Linking.openURL(
                  `https://explorer.solana.com/tx/${flow.signature}?cluster=devnet`,
                )
              }
              style={styles.explorerLink}
              accessibilityRole="link"
              testID="vault-deposit-result-explorer"
            >
              <Text style={styles.explorerText}>{t('Check on explorer')}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        {isCompleted && showsDepositAgain ? (
          <Pressable
            onPress={depositAgain}
            style={styles.depositAgainButton}
            accessibilityRole="button"
            testID="vault-deposit-result-deposit-again"
          >
            <Text style={styles.depositAgainText}>{t('Deposit again')}</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={done}
          style={styles.goBackButton}
          accessibilityRole="button"
          testID="vault-deposit-result-go-back"
        >
          <Text style={styles.goBackText}>{t('Go back')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Copyable({
  display,
  full,
  onCopy,
}: {
  display: string;
  full: string;
  onCopy: (value: string) => void;
}) {
  return (
    <Pressable onPress={() => onCopy(full)} accessibilityRole="button">
      <Text style={styles.value}>{display}</Text>
    </Pressable>
  );
}

function formatDate(epochMs: number): string {
  const d = new Date(epochMs);
  const day = d.getDate();
  const month = d.toLocaleString('en-US', { month: 'short' });
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hh}:${mm}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  gradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 345 },
  scrollContent: { paddingBottom: 24 },
  amountBlock: { alignItems: 'center', gap: 20, paddingTop: 48, paddingBottom: 28 },
  amountLabel: { ...beVietnamPro(18), letterSpacing: -0.36, color: colors.neutral600 },
  amountValue: { ...beVietnamPro(48), letterSpacing: -2.4, color: colors.neutral950 },
  bottomBar: { flexDirection: 'row', gap: 12, marginHorizontal: 24, marginBottom: 32 },
  depositAgainButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: colors.white,
    // A visible edge: with the old #EFEFEF border on the #F7F7F7 page, the pill's outline
    // vanished and it read shorter than Go back (both are 52pt).
    borderWidth: 1,
    borderColor: '#DADADA',
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  depositAgainText: {
    ...beVietnamPro(17, 'regular'),
    letterSpacing: -0.68,
    color: colors.contentB,
  },
  detailsShell: {
    marginHorizontal: 15,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 12,
    borderRadius: 26,
    backgroundColor: '#EFEFEF',
    gap: 8,
  },
  detailsCard: { padding: 16, borderRadius: 18, backgroundColor: colors.white, gap: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { ...beVietnamPro(15), letterSpacing: -0.45, color: colors.contentM },
  value: { ...beVietnamPro(16), letterSpacing: -0.32, color: '#393939' },
  statusValue: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusDot: { width: 16, height: 16, borderRadius: 8 },
  covered: { ...beVietnamPro(16), letterSpacing: -0.32, color: GREEN },
  explorerLink: { alignSelf: 'center', paddingBottom: 4 },
  explorerText: { ...beVietnamPro(16), letterSpacing: -0.32, color: '#393939' },
  goBackButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: colors.neutral900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goBackText: { ...beVietnamPro(17, 'regular'), letterSpacing: -0.68, color: colors.white },
});
