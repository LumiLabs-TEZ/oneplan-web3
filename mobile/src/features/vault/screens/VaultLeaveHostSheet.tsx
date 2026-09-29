/**
 * Host leave-confirmation sheet — port of `VaultLeaveHostBottomSheet.swift` (`feat/web3-version`,
 * Figma 4716:2227 / 4716:2108 / 4712:2514 / 4712:2689). Amounts are USDC, same as the member sheet.
 *
 * Presentational (like `TripVaultCard`): the caller passes the `VaultLeaveRequestDto` to confirm
 * and owns the `confirmVaultLeave` mutation, so this component has no network dependency of its
 * own and is easy to drive from a fixture in `(dev)/vault-leave`.
 */
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { components } from '@/api/schema';
import { useAppLanguage } from '@/i18n';
import { formatUsdc } from '@/lib/currency';
import { svg } from '@/ui/assets';
import { AppSheet, type AppSheetRef, Button, Spinner } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import {
  hostLeaveDisplay,
  hostLeaveSheetHeight,
  type HostLeavePhase,
  microToUsdc,
  shortenAddress,
} from '../leaveModel';

type VaultLeaveRequestDto = components['schemas']['VaultLeaveRequestDto'];

function usd(micro: number): string {
  return `$${formatUsdc(microToUsdc(micro))}`;
}

export interface VaultLeaveHostSheetProps {
  request: VaultLeaveRequestDto | null;
  isWorking?: boolean;
  /** Called for READY / PAYOUT. Resolve `true` when the member was actually removed. */
  onConfirm: (request: VaultLeaveRequestDto) => Promise<boolean>;
  /** WAITING_DEPOSIT dismiss, or PAYOUT/READY confirm-then-dismiss — no decision either way. */
  onDismiss?: () => void;
}

export interface VaultLeaveHostSheetRef {
  present: () => void;
  dismiss: () => void;
}

export const VaultLeaveHostSheet = forwardRef<VaultLeaveHostSheetRef, VaultLeaveHostSheetProps>(
  function VaultLeaveHostSheet({ request, isWorking = false, onConfirm, onDismiss }, ref) {
    useAppLanguage();
    const { t } = useTranslation();
    const sheetRef = useRef<AppSheetRef>(null);
    const [phase, setPhase] = useState<HostLeavePhase>('request');

    // A new request while this sheet is still mounted (host confirms one, another arrives) always
    // starts back at `request` — mirrors the Swift sheet being re-created per `.sheet(item:)`.
    // Adjusted during render (React's "resetting state when a prop changes" pattern), not an
    // effect — an effect here would set state a frame late and cascade an extra render.
    const [lastRequestUserId, setLastRequestUserId] = useState(request?.userId);
    if (request?.userId !== lastRequestUserId) {
      setLastRequestUserId(request?.userId);
      setPhase('request');
    }

    useImperativeHandle(ref, () => ({
      present: () => {
        setPhase('request');
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    if (!request) {
      return (
        <AppSheet ref={sheetRef} snapPoints={[420]} onDismiss={onDismiss}>
          <View />
        </AppSheet>
      );
    }

    const display = hostLeaveDisplay(request, phase);
    const titleText =
      phase === 'left'
        ? t('%@ left', { 0: request.displayName })
        : display.isPayout
          ? t('Confirm action')
          : t('%@ is leaving', { 0: request.displayName });
    const ctaTitle = phase === 'left' || !display.isPayout ? t('Got it') : t('Approve & send');
    const address = shortenAddress(request.walletAddress);

    const handleCta = async () => {
      if (phase === 'left') {
        sheetRef.current?.dismiss();
        return;
      }
      if (request.status === 'WAITING_DEPOSIT') {
        sheetRef.current?.dismiss();
        return;
      }
      const removed = await onConfirm(request);
      if (removed) {
        setPhase('left');
      }
    };

    return (
      <AppSheet
        ref={sheetRef}
        snapPoints={[hostLeaveSheetHeight(display.isPayout)]}
        onDismiss={onDismiss}
      >
        <View style={styles.container} testID="vault-leave-host-sheet">
          <Pressable
            onPress={() => sheetRef.current?.dismiss()}
            accessibilityRole="button"
            accessibilityLabel={t('Back')}
            hitSlop={12}
            style={styles.backButton}
          >
            <svg.vault.leaveBackArrow width={28} height={28} style={styles.backIcon} />
          </Pressable>

          <View style={styles.body}>
            <Text style={styles.title}>{titleText}</Text>
            <BodyCopy phase={phase} isPayout={display.isPayout} displayName={request.displayName} />
            <Text style={styles.amount}>{usd(display.displayAmountMicro)}</Text>
          </View>

          {display.isPayout ? (
            <View style={styles.addressCard} testID="vault-leave-host-payout-address">
              <View style={styles.addressRows}>
                <DetailRow label={t('%@’s address', { 0: request.displayName })} value={address ?? t('No wallet linked')} />
                <DetailRow label={t('Asset')} value="USDC" />
              </View>
              <Text style={styles.addressWarning}>
                {t('Please double-check with %@ to verify whether the address above is correct.', {
                  0: request.displayName,
                })}
              </Text>
            </View>
          ) : phase === 'request' && display.statusBadge ? (
            <View style={styles.statusPill}>
              {display.statusBadge === 'waiting' ? (
                <svg.vault.leaveWaitingCheck width={19} height={19} />
              ) : (
                <svg.vault.leaveReceivedCheck width={19} height={19} />
              )}
              <Text style={styles.statusPillText}>
                {display.statusBadge === 'waiting' ? t('Waiting for settlement') : t('Received')}
              </Text>
            </View>
          ) : null}

          <View style={styles.ctaRow}>
            {isWorking ? (
              <Spinner fill={false} />
            ) : (
              <Button title={ctaTitle} variant="dark" onPress={() => void handleCta()} testID="vault-leave-host-cta" />
            )}
          </View>
        </View>
      </AppSheet>
    );
  },
);

function BodyCopy({
  phase,
  isPayout,
  displayName,
}: {
  phase: HostLeavePhase;
  isPayout: boolean;
  displayName: string;
}) {
  // Intentional divergence from every other string in this sheet: iOS builds these fragments with
  // plain `Text(prefix)`/`Text(suffix)` literals (`highlightedNameCopy`, VaultLeaveHostBottomSheet.
  // swift), which SwiftUI's genstrings scan never wraps in `String(localized:)` — so iOS itself
  // ships this copy unlocalized (always English). Ported as-is: hardcoded, not run through `t()`.
  if (phase === 'left') {
    return (
      <Text style={styles.bodyCopy}>
        <Text style={styles.bodyCopyName}>{displayName}</Text>
        {' has left the group, and the final settlement has been completed.'}
      </Text>
    );
  }
  if (isPayout) {
    return (
      <Text style={styles.bodyCopy}>
        <Text style={styles.bodyCopyName}>{displayName}</Text>
        {' is leaving the group and requesting a withdrawal of the remaining funds he has in the group pool.'}
      </Text>
    );
  }
  return (
    <Text style={styles.bodyCopy}>
      {'Please confirm receipt of the amount below, transferred by '}
      <Text style={styles.bodyCopyName}>{displayName}</Text>
      {' for leaving the group.'}
    </Text>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.detailValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  backButton: {
    alignSelf: 'flex-start',
    marginLeft: spacing.lg,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { width: 28, height: 28, transform: [{ rotate: '90deg' }] },
  body: { alignItems: 'center', gap: 16, paddingHorizontal: spacing.lg },
  title: { ...beVietnamPro(16, 'medium'), color: colors.contentB, textAlign: 'center' },
  bodyCopy: { ...beVietnamPro(14), color: colors.contentM, textAlign: 'center' },
  bodyCopyName: { ...beVietnamPro(14, 'medium'), color: colors.contentB },
  amount: { ...beVietnamPro(32), color: colors.contentB },
  addressCard: {
    marginHorizontal: spacing.lg,
    padding: 3,
    paddingBottom: 5,
    borderRadius: 10,
    backgroundColor: colors.neutral50,
    gap: spacing.xs,
  },
  addressRows: { backgroundColor: colors.white, borderRadius: 8 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  detailLabel: { ...beVietnamPro(14), color: colors.contentM },
  detailValue: { ...beVietnamPro(14, 'medium'), color: colors.contentB },
  addressWarning: { ...beVietnamPro(14), color: colors.contentB, paddingHorizontal: spacing.sm },
  statusPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.background,
  },
  statusPillText: { ...beVietnamPro(14), color: colors.neutral700 },
  ctaRow: { marginHorizontal: spacing.lg, marginTop: 'auto' },
});
