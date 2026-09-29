/**
 * Expandable receive/pay settlement card — port of
 * `ios/OnePlan/OnePlan/Component/Vault/VaultSettlementRow.swift`. Figma `4013:13084` / `4013:12968`.
 *
 * Only the vault cash-debt shape is ported (every row here always carries a USDC face value):
 * Swift's row is also reused by the classic (non-vault) breakdown row, which has no USDC figure —
 * that adapter is `trip-end-breakdown-item-rewrite`, a separate Wave D row not built by this pass
 * (see the inventory notes for why).
 */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { formatUsdc, formatWhole } from '@/lib/currency';
import { useAppLanguage } from '@/i18n';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { shortenAddress } from '../shortenAddress';
import { PersonAvatar } from './PersonAvatar';
import type { VaultSettlementEntryModel } from '../helpers/tripEndSettlement';

export interface VaultSettlementRowProps {
  entry: VaultSettlementEntryModel;
  onMarkAsDone?: () => void | Promise<void>;
  onShowQR?: () => void;
  onSendToWallet?: () => void | Promise<void>;
  /** External pending flag (e.g. the owning screen's mutation) — merged with local `isWorking`. */
  isWorking?: boolean;
  testID?: string;
}

export function VaultSettlementRow({
  entry,
  onMarkAsDone,
  onShowQR,
  onSendToWallet,
  isWorking: externalWorking = false,
  testID,
}: VaultSettlementRowProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [localWorking, setLocalWorking] = useState(false);
  const isSettled = entry.state !== 'outstanding';
  const isWorking = externalWorking || localWorking;

  const run = async (action?: () => void | Promise<void>) => {
    if (!action) return;
    setLocalWorking(true);
    try {
      await action();
    } finally {
      setLocalWorking(false);
    }
  };

  const showsDirectionLabel = !(isSettled && entry.amount === 0);
  const directionLabel =
    entry.direction === 'receiving'
      ? isExpanded
        ? t('Bạn nhận từ')
        : t('Nhận từ')
      : t('Chuyển cho');
  const displayName =
    entry.walletAddress && entry.direction === 'paying'
      ? `${entry.name} (${shortenAddress(entry.walletAddress)})`
      : entry.extraCount > 0
        ? t('Group')
        : entry.name;

  return (
    <Animated.View
      layout={LinearTransition.duration(220)}
      style={styles.card}
      testID={testID ?? 'vault-settlement-row'}
    >
      <Pressable
        onPress={() => setIsExpanded((v) => !v)}
        style={styles.header}
        accessibilityRole="button"
        testID="vault-settlement-row-toggle"
      >
        <AvatarBlock entry={entry} />

        <View style={styles.nameBlock}>
          {showsDirectionLabel ? <Text style={styles.directionText}>{directionLabel}</Text> : null}
          <Text style={styles.nameText} numberOfLines={1}>
            {displayName}
          </Text>
        </View>

        <View style={styles.amountBlock}>
          <View style={styles.amountRow}>
            <Text style={styles.usdcAmount}>{formatUsdc(entry.amountUsdc)}</Text>
            <Text style={styles.usdcUnit}>USDC</Text>
          </View>
          <View style={styles.amountRow}>
            <Text style={styles.vndSymbol}>đ</Text>
            <Text style={styles.vndAmount}>{formatWhole(entry.amount)}</Text>
          </View>
          {isSettled ? <Text style={styles.successText}>{t('Success')}</Text> : null}
        </View>

        <TrailingBadge isSettled={isSettled} isExpanded={isExpanded} />
      </Pressable>

      {isExpanded ? (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
          {entry.lines.map((line, index) => (
            <View key={`${line.title}-${index}`}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <View style={styles.lineRow}>
                <Text style={styles.lineTitle} numberOfLines={1}>
                  {line.title}
                </Text>
                <View style={styles.lineAmountBlock}>
                  <Text style={styles.lineUsdc}>{formatUsdc(line.amountUsdc)} USDC</Text>
                  <Text style={styles.lineVnd}>{formatWhole(line.amount)}đ</Text>
                </View>
              </View>
            </View>
          ))}

          {!isSettled ? (
            <ActionButtons
              entry={entry}
              isWorking={isWorking}
              onMarkAsDone={() => void run(onMarkAsDone)}
              onShowQR={onShowQR}
              onSendToWallet={() => void run(onSendToWallet)}
              hasLines={entry.lines.length > 0}
            />
          ) : null}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

function AvatarBlock({ entry }: { entry: VaultSettlementEntryModel }) {
  const showsStack = entry.extraCount > 0 || entry.avatarUrls.length > 1;
  if (!showsStack) {
    return <PersonAvatar uri={entry.avatarUrls[0]} name={entry.name} size={52} />;
  }
  const offsets = [
    { left: 0, top: 5.7 },
    { left: 23, top: 0 },
    { left: 7, top: 23 },
  ];
  return (
    <View style={styles.avatarStack}>
      {entry.avatarUrls.slice(0, 3).map((url, index) => (
        <View
          key={`${url}-${index}`}
          style={[styles.avatarStackItem, offsets[index], { width: 29, height: 29 }]}
        >
          <PersonAvatar uri={url} name={entry.name} size={29} />
        </View>
      ))}
      {entry.extraCount > 0 ? (
        <View style={styles.extraBadge}>
          <Text style={styles.extraBadgeText}>+{entry.extraCount}</Text>
        </View>
      ) : null}
    </View>
  );
}

function TrailingBadge({ isSettled, isExpanded }: { isSettled: boolean; isExpanded: boolean }) {
  if (isSettled) {
    return (
      <View style={[styles.trailingBadge, styles.trailingBadgeDone]}>
        <Ionicons name="checkmark" size={12} color={colors.white} />
      </View>
    );
  }
  return (
    <View style={styles.trailingBadge}>
      <Ionicons
        name={isExpanded ? 'chevron-down' : 'chevron-forward'}
        size={12}
        color={colors.contentL}
      />
    </View>
  );
}

function ActionButtons({
  entry,
  isWorking,
  onMarkAsDone,
  onShowQR,
  onSendToWallet,
  hasLines,
}: {
  entry: VaultSettlementEntryModel;
  isWorking: boolean;
  onMarkAsDone: () => void;
  onShowQR?: () => void;
  onSendToWallet: () => void;
  hasLines: boolean;
}) {
  const { t } = useTranslation();
  const topPad = hasLines ? spacing.xs : spacing.sm;

  if (entry.direction === 'receiving') {
    return (
      <View style={[styles.actionRow, { paddingTop: topPad }]}>
        <Pressable
          onPress={onMarkAsDone}
          disabled={isWorking || !entry.canConfirm}
          style={[styles.pillButton, styles.pillBlack, !entry.canConfirm && styles.pillDisabled]}
          testID="vault-settlement-mark-done"
        >
          {isWorking ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.pillLabel}>{t('Mark as done')}</Text>
          )}
        </Pressable>
        <Pressable
          onPress={onShowQR}
          disabled={isWorking}
          style={[styles.pillButton, styles.pillBlue]}
          testID="vault-settlement-show-qr"
        >
          <Text style={styles.pillLabel}>{t('Show QR')}</Text>
        </Pressable>
      </View>
    );
  }

  if (entry.walletAddress) {
    return (
      <View style={[styles.actionRow, { paddingTop: topPad }]}>
        <Pressable
          onPress={onSendToWallet}
          disabled={isWorking}
          style={[styles.pillButton, styles.pillBlue, styles.pillFull]}
          testID="vault-settlement-send"
        >
          {isWorking ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.pillLabel}>{t('Send')}</Text>
          )}
        </Pressable>
      </View>
    );
  }

  if (entry.canConfirm) {
    return (
      <View style={[styles.actionRow, { paddingTop: topPad }]}>
        <Pressable
          onPress={onMarkAsDone}
          disabled={isWorking}
          style={[styles.pillButton, styles.pillBlack, styles.pillFull]}
          testID="vault-settlement-mark-done"
        >
          {isWorking ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.pillLabel}>{t('Mark as done')}</Text>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.waitingRow, { paddingTop: topPad }]}>
      <Text style={styles.waitingText}>{t('Waiting for {{0}} to confirm', { 0: entry.name })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    boxShadow: '0px 0px 8.95px rgba(0, 0, 0, 0.09)',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  nameBlock: { flex: 1, gap: 2 },
  directionText: { ...beVietnamPro(14), color: colors.neutral700, letterSpacing: -0.28 },
  nameText: { ...beVietnamPro(16, 'medium'), color: colors.contentB, letterSpacing: -0.32 },
  amountBlock: { alignItems: 'flex-end', gap: 2 },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  usdcAmount: { ...beVietnamPro(18), color: colors.contentB, letterSpacing: -0.36 },
  usdcUnit: { ...beVietnamPro(18), color: colors.contentL, letterSpacing: -0.36 },
  vndSymbol: { ...beVietnamPro(14), color: colors.contentL, letterSpacing: -0.28 },
  vndAmount: { ...beVietnamPro(14), color: colors.contentM, letterSpacing: -0.28 },
  successText: { ...beVietnamPro(14), color: colors.contentM, letterSpacing: -0.28 },
  trailingBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.onSurface,
  },
  trailingBadgeDone: { backgroundColor: colors.blueBase },
  avatarStack: { width: 52, height: 52 },
  avatarStackItem: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 2.6,
    borderColor: colors.white,
    overflow: 'hidden',
  },
  extraBadge: {
    position: 'absolute',
    left: 26,
    top: 20,
    width: 21,
    height: 21,
    borderRadius: 999,
    backgroundColor: colors.green400,
    borderWidth: 1.5,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraBadgeText: { ...beVietnamPro(10, 'semibold'), color: colors.white },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.dividerStroke },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  lineTitle: { ...beVietnamPro(14), color: colors.contentB, letterSpacing: -0.7, flex: 1 },
  lineAmountBlock: { alignItems: 'flex-end', gap: 2 },
  lineUsdc: { ...beVietnamPro(16), color: colors.contentB, letterSpacing: -0.32 },
  lineVnd: { ...beVietnamPro(13), color: colors.contentM, letterSpacing: -0.26 },
  actionRow: { flexDirection: 'row', gap: 6, paddingBottom: spacing.xs },
  pillButton: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  pillFull: { flex: 1 },
  pillBlack: { backgroundColor: colors.black },
  pillBlue: { backgroundColor: colors.blueBase },
  pillDisabled: { opacity: 0.45 },
  pillLabel: { ...beVietnamPro(15), color: colors.white, letterSpacing: -0.75 },
  waitingRow: { paddingBottom: spacing.xs },
  waitingText: { ...beVietnamPro(13), color: colors.contentM },
});
