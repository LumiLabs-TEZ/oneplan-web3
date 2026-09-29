/**
 * Port of `WalletWithdrawResultView.swift` (`origin/feat/web3-version`, Figma `4239:14190` /
 * `14799` / `14888`) — the receipt for a withdrawal. Every fee line reads "Covered" rather than a
 * number: the member holds no SOL and pays nothing.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { VaultHeaderChip } from '../components/VaultHeaderChip';
import { VaultSkyGradient } from '../components/VaultSkyGradient';

export type WalletWithdrawStatus = 'completed' | 'processing' | 'failed';

export interface WalletWithdrawResult {
  status: WalletWithdrawStatus;
  amountMicro: bigint;
  recipient: string;
  signature: string;
  date: Date;
}

export interface WalletWithdrawResultScreenProps {
  result: WalletWithdrawResult;
  onDone: () => void;
  onSendAgain?: () => void;
}

const GRADIENT_BY_STATUS: Record<WalletWithdrawStatus, readonly [string, string, string]> = {
  completed: ['rgb(180, 223, 255)', 'rgb(251, 236, 215)', colors.background],
  processing: ['rgb(255, 200, 180)', 'rgb(251, 236, 215)', colors.background],
  failed: ['rgb(255, 180, 182)', 'rgb(251, 215, 215)', colors.background],
};

export function WalletWithdrawResultScreen({
  result,
  onDone,
  onSendAgain,
}: WalletWithdrawResultScreenProps) {
  useAppLanguage();
  const { t } = useTranslation();

  function copy(value: string) {
    void Clipboard.setStringAsync(value);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  return (
    <View style={styles.container}>
      {/* Rendered first so it paints as the background — RN stacks later siblings on top,
          unlike SwiftUI's `.background { gradient }` which paints behind its content. */}
      <VaultSkyGradient colors={GRADIENT_BY_STATUS[result.status]} />

      <View style={styles.header}>
        <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel={t('Back')}>
          <VaultHeaderChip>
            <View style={styles.headerIconWrap}>
              <Ionicons name="arrow-back" size={14} color={colors.neutral900} />
            </View>
          </VaultHeaderChip>
        </Pressable>
        <Text style={styles.headerTitle}>{t('Move money')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.amountBlock}>
          <Text style={styles.amountLabel}>{t('Amount')}</Text>
          <Text style={styles.amount} numberOfLines={1}>
            {amountText(result.amountMicro)}
          </Text>
          {result.status === 'completed' && onSendAgain ? (
            <Pressable
              onPress={onSendAgain}
              style={styles.sendAgainButton}
              testID="withdraw-result-send-again"
            >
              <Text style={styles.sendAgainLabel}>{t('Send again')}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.detailsShell}>
          <View style={styles.card}>
            <Row label={t('Status')}>
              <View style={styles.statusRow}>
                <StatusIcon status={result.status} />
                <Text style={styles.value}>{statusTitle(result.status, t)}</Text>
              </View>
            </Row>
            <Row label={t('Date')}>
              <Text style={styles.value}>{formatDate(result.date)}</Text>
            </Row>
            <Row label={t('Recipient')}>
              <Pressable
                onPress={() => copy(result.recipient)}
                style={styles.copyRow}
                testID="withdraw-result-copy-recipient"
              >
                <Text style={styles.value}>{shorten(result.recipient)}</Text>
                <Ionicons name="copy-outline" size={12} color={colors.contentM} />
              </Pressable>
            </Row>
            <Row label={t('Transaction ID')}>
              <Pressable
                onPress={() => copy(result.signature)}
                style={styles.copyRow}
                testID="withdraw-result-copy-signature"
              >
                <Text style={styles.value}>{shorten(result.signature)}</Text>
                <Ionicons name="copy-outline" size={12} color={colors.contentM} />
              </Pressable>
            </Row>
            <Row label={t('Onchain fees')}>
              <Text style={styles.covered}>{t('Covered')}</Text>
            </Row>
            <Row label={t('Estimated gas fee')}>
              <Text style={styles.covered}>{t('Covered')}</Text>
            </Row>
          </View>

          <Pressable
            onPress={() => void Linking.openURL(explorerUrl(result.signature))}
            style={styles.explorerLink}
          >
            <Text style={styles.explorerText}>{t('Check on explorer')}</Text>
            <Ionicons name="open-outline" size={15} color="rgb(57, 57, 57)" />
          </Pressable>
        </View>
      </ScrollView>

      <Pressable onPress={onDone} style={styles.doneButton} testID="withdraw-result-go-back">
        <Text style={styles.doneLabel}>{t('Go back')}</Text>
      </Pressable>
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

function StatusIcon({ status }: { status: WalletWithdrawStatus }) {
  if (status === 'completed') {
    return <Ionicons name="checkmark-circle" size={16} color={colors.green400} />;
  }
  if (status === 'failed') {
    return <Ionicons name="alert-circle" size={16} color={colors.secondary} />;
  }
  return <Ionicons name="sync" size={16} color="rgb(255, 140, 64)" />;
}

function statusTitle(status: WalletWithdrawStatus, t: (key: string) => string): string {
  switch (status) {
    case 'completed':
      return t('Completed');
    case 'processing':
      return t('Processing');
    case 'failed':
      return t('Failed');
  }
}

function amountText(amountMicro: bigint): string {
  const value = Number(amountMicro) / 1_000_000;
  return value === Math.floor(value) ? `$${value.toFixed(0)}` : `$${value.toFixed(2)}`;
}

function shorten(text: string): string {
  if (text.length <= 12) return text;
  return `${text.slice(0, 5)}...${text.slice(-4)}`;
}

function explorerUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

function formatDate(date: Date): string {
  const day = date.getDate();
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ] as const;
  const month = months[date.getMonth()] ?? '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${date.getFullYear()}, ${hh}:${mm}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
  headerIconWrap: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    ...beVietnamPro(14),
    letterSpacing: -0.28,
    color: colors.contentB,
  },
  headerSpacer: { width: 32 },
  scrollContent: { paddingBottom: 24 },
  amountBlock: { alignItems: 'center', gap: 20, paddingTop: 48, paddingBottom: 28 },
  amountLabel: { ...beVietnamPro(18), letterSpacing: -0.36, color: 'rgb(136, 136, 136)' },
  amount: { ...beVietnamPro(48), letterSpacing: -2.4, color: colors.neutral950 },
  sendAgainButton: {
    width: 147,
    height: 44,
    borderRadius: 999,
    backgroundColor: colors.onSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendAgainLabel: { ...beVietnamPro(15), letterSpacing: -0.75, color: colors.contentB },
  detailsShell: {
    marginHorizontal: 15,
    marginTop: 8,
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 8,
    gap: 8,
    borderRadius: 26,
    backgroundColor: 'rgb(239, 239, 239)',
  },
  card: { gap: 16, padding: 16, borderRadius: 18, backgroundColor: colors.white },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowLabel: { ...beVietnamPro(15), letterSpacing: -0.45, color: colors.contentM },
  value: { ...beVietnamPro(16), letterSpacing: -0.32, color: 'rgb(57, 57, 57)' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  covered: { ...beVietnamPro(16), letterSpacing: -0.32, color: colors.green400 },
  explorerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingBottom: 4,
  },
  explorerText: { ...beVietnamPro(16), letterSpacing: -0.32, color: 'rgb(57, 57, 57)' },
  doneButton: {
    marginHorizontal: 24,
    marginBottom: 32,
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: colors.neutral900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneLabel: { ...beVietnamPro(17), letterSpacing: -0.68, color: colors.white },
});
