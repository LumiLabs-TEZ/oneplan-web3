/**
 * Vault trip leave — member sheet. Port of `VaultLeaveBottomSheet.swift` (`feat/web3-version`,
 * Figma 4711:1772 / 1973 / 2140). Entire sheet is USDC (vault ledger); merchant VND stays on the
 * History tab.
 *
 * Self-contained like `LeaveTripSheet`: fetches its own leave preview while presented and drives
 * its own announce mutation. The ledger rows below are a minimal local stand-in for the shared
 * `VaultHistoryRow` (Wave C, `docs/web3/rn-ui-parity-inventory.md` id `vault-history-row`) — swap
 * to that component once it lands; this sheet is a second of its three documented consumers.
 */
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { mutationErrorMessage } from '@/api/mutationError';
import type { ExpenseCategory } from '@/features/expense/categories';
import { EXPENSE_CATEGORIES } from '@/features/expense/categories';
import { useLeavePreview } from '@/features/trip/api/leave';
import { useAppLanguage } from '@/i18n';
import { formatUsdc } from '@/lib/currency';
import { AppSheet, type AppSheetRef, Button, Spinner } from '@/ui/components';
import { svg } from '@/ui/assets';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { useAnnounceVaultLeave } from '../api/leave';
import { CategoryIcon } from '../components';
import { memberLeaveSheetHeight, memberLeaveState, microToUsdc, signedUsdcPrefix } from '../leaveModel';

const KNOWN_CATEGORIES = new Set<string>(EXPENSE_CATEGORIES.map((c) => c.value));

function toExpenseCategory(value: string | null | undefined): ExpenseCategory {
  return value != null && KNOWN_CATEGORIES.has(value) ? (value as ExpenseCategory) : 'OTHER';
}

function usd(micro: number): string {
  return `$${formatUsdc(microToUsdc(micro))}`;
}

export interface VaultLeaveSheetProps {
  tripId: number;
  /**
   * Called with the fee-grossed deposit amount (micro-USDC) once this sheet finishes
   * dismissing — mirrors iOS's `.vaultRequestContribute` handoff to `ContributeToVaultView`.
   */
  onRequestDeposit: (grossDepositMicro: number) => void;
}

export interface VaultLeaveSheetRef {
  present: () => void;
  dismiss: () => void;
}

export const VaultLeaveSheet = forwardRef<VaultLeaveSheetRef, VaultLeaveSheetProps>(
  function VaultLeaveSheet({ tripId, onRequestDeposit }, ref) {
    useAppLanguage();
    const { t } = useTranslation();
    const sheetRef = useRef<AppSheetRef>(null);
    const [open, setOpen] = useState(false);
    const pendingDepositMicro = useRef<number | null>(null);

    const preview = useLeavePreview(tripId, { enabled: open });
    const announce = useAnnounceVaultLeave(tripId);

    useImperativeHandle(ref, () => ({
      present: () => {
        setOpen(true);
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const dto = preview.data;
    const state = dto ? memberLeaveState(dto) : null;

    const statusLabel = !state
      ? ''
      : state.kind === 'owe'
        ? t('You owe the group')
        : state.kind === 'receive'
          ? t('You’ll receive')
          : t('All good');

    const settlementValue = !state
      ? usd(0)
      : state.kind === 'owe'
        ? t('Deposit %@', { 0: usd(state.depositGrossMicro) })
        : state.kind === 'receive'
          ? t('Receive %@', { 0: usd(state.netMicro) })
          : usd(0);

    const handleDeposit = () => {
      if (!state) return;
      pendingDepositMicro.current = state.depositGrossMicro;
      sheetRef.current?.dismiss();
    };

    const handleAnnounce = async () => {
      if (!state?.canTapAnnounce || announce.isPending) return;
      try {
        await announce.mutateAsync();
      } catch (err) {
        Alert.alert(mutationErrorMessage(err, t('Failed to announce leave')));
      }
    };

    const handleDismissed = () => {
      setOpen(false);
      const amount = pendingDepositMicro.current;
      pendingDepositMicro.current = null;
      if (amount != null) onRequestDeposit(amount);
    };

    return (
      <AppSheet
        ref={sheetRef}
        snapPoints={[memberLeaveSheetHeight(dto?.lines.length ?? 0)]}
        onDismiss={handleDismissed}
      >
        <View style={styles.container} testID="vault-leave-sheet">
          <Pressable
            onPress={() => sheetRef.current?.dismiss()}
            accessibilityRole="button"
            accessibilityLabel={t('Back')}
            hitSlop={12}
            style={styles.backButton}
          >
            <svg.vault.leaveBackArrow width={28} height={28} style={styles.backIcon} />
          </Pressable>

          {preview.isPending ? (
            <Spinner fill />
          ) : dto && state ? (
            <>
              <View style={styles.hero}>
                <Text style={styles.heroLabel}>{statusLabel}</Text>
                <Text style={styles.heroAmount}>{usd(state.heroAmountMicro)}</Text>
              </View>

              <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.ledgerCard}>
                  {dto.lines.map((line, index) => (
                    <LedgerRow key={`${line.title}-${index}`} line={line} />
                  ))}
                </View>

                <View style={styles.totals}>
                  <TotalRow label={t('Total deposited')} value={usd(Math.max(0, state.totalDepositedMicro))} />
                  <TotalRow
                    label={t('Total expenses')}
                    value={`${signedUsdcPrefix(state.totalExpensesMicro)}${usd(Math.abs(state.totalExpensesMicro))}`}
                  />
                  <TotalRow label={t('Settlement')} value={settlementValue} />
                </View>
              </ScrollView>

              {dto.leaveRequestPending ? (
                <Text style={styles.pendingCta} testID="vault-leave-cta-pending">
                  {t('Announce sent')}
                </Text>
              ) : state.kind === 'owe' ? (
                <Button
                  title={t('Deposit %@', { 0: usd(state.depositGrossMicro) })}
                  variant="dark"
                  style={styles.cta}
                  onPress={handleDeposit}
                  testID="vault-leave-cta-deposit"
                />
              ) : (
                <Button
                  title={t('Announce host')}
                  variant="dark"
                  style={styles.cta}
                  loading={announce.isPending}
                  disabled={!state.canTapAnnounce}
                  onPress={() => void handleAnnounce()}
                  testID="vault-leave-cta-announce"
                />
              )}
            </>
          ) : null}
        </View>
      </AppSheet>
    );
  },
);

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={styles.totalValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function LedgerRow({
  line,
}: {
  line: { title: string; amountMicro: string; kind: string; time: string; subtitle?: string | null; category?: string | null };
}) {
  const signedMicro = Number(line.amountMicro) || 0;
  const isDeposit = line.kind.toUpperCase() === 'DEPOSIT';
  const isSettlement = line.kind.toUpperCase() === 'SETTLEMENT';

  return (
    <View style={styles.ledgerRow} testID="vault-leave-ledger-row">
      {isDeposit || isSettlement ? (
        <View style={[styles.ledgerBadge, isDeposit ? styles.ledgerBadgeGreen : styles.ledgerBadgeNeutral]}>
          <Text style={styles.ledgerBadgeText}>{isDeposit ? '↓' : '⇄'}</Text>
        </View>
      ) : (
        <CategoryIcon category={toExpenseCategory(line.category)} size={36} />
      )}
      <View style={styles.ledgerMain}>
        <Text style={styles.ledgerTitle} numberOfLines={1}>
          {line.title}
        </Text>
        <Text style={styles.ledgerSubtitle} numberOfLines={1}>
          {[line.subtitle, line.time].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text style={[styles.ledgerAmount, signedMicro < 0 && styles.ledgerAmountNegative]}>
        {signedUsdcPrefix(signedMicro)}
        {usd(Math.abs(signedMicro))}
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
  hero: { alignItems: 'center', gap: 4, paddingHorizontal: spacing.lg },
  heroLabel: { ...beVietnamPro(14), color: colors.contentM },
  heroAmount: { ...beVietnamPro(32), color: colors.contentB },
  content: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  ledgerCard: { borderRadius: 24, backgroundColor: colors.neutral50, overflow: 'hidden' },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.neutral100,
  },
  ledgerBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ledgerBadgeGreen: { backgroundColor: colors.green500 },
  ledgerBadgeNeutral: { backgroundColor: colors.neutral200 },
  ledgerBadgeText: { ...beVietnamPro(16), color: colors.white },
  ledgerMain: { flex: 1, gap: 2 },
  ledgerTitle: { ...beVietnamPro(14), color: colors.contentB },
  ledgerSubtitle: { ...beVietnamPro(12), color: colors.contentM },
  ledgerAmount: { ...beVietnamPro(14), color: colors.contentB },
  ledgerAmountNegative: { color: colors.secondary },
  totals: { gap: spacing.xs, paddingTop: spacing.xs },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalLabel: { ...beVietnamPro(14), color: colors.contentM },
  totalValue: { ...beVietnamPro(14), color: colors.contentB },
  pendingCta: {
    ...beVietnamPro(17),
    color: colors.contentM,
    textAlign: 'center',
    marginHorizontal: spacing.lg,
    minHeight: 52,
    textAlignVertical: 'center',
  },
  cta: { marginHorizontal: spacing.lg, backgroundColor: colors.neutral900 },
});
