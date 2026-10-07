/**
 * Port of `VaultTransactionDetailView.swift` (`origin/feat/web3-version`, Figma `4575:15159`) —
 * the receipt for a single vault payment: status, bank details, group split, and (server-gated)
 * approve/cancel/edit/send-again actions.
 *
 * Every visibility gate (`showsApprove`/`showsCancel`/`showsEdit`) reads the server-authoritative
 * `canApprove`/`canCancel`/`canEdit` booleans on the detail — never re-derived from role/ownership
 * locally.
 */
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetView } from '@gorhom/bottom-sheet';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { components } from '@/api/schema';
import { useAppLanguage } from '@/i18n';
import { CurrencyFormatter } from '@/lib/currency';
import { AppSheet, type AppSheetRef, Avatar } from '@/ui/components';
import type { TranslateFn } from '@/ui/relativeTime';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { categoryOption } from '@/features/expense/categories';
import { CategoryIcon } from '../components/CategoryIcon';
import { VaultPalette } from '../components/VaultPalette';
import { VaultSkyGradient } from '../components/VaultSkyGradient';
import {
  useApproveVaultTransaction,
  useCancelVaultTransaction,
  vaultPayErrorMessage,
} from '../api/pay';
import type { VaultTransactionDetail } from './transactionDetailMapping';
import { VaultTransactionEditScreen } from './VaultTransactionEditScreen';
import type { VaultTransactionDetailDto } from '../api/mutations';
import { WalletError } from '../wallet/walletError';
import { walletErrorMessage } from './walletErrorMessage';

type TripMemberDto = components['schemas']['TripMemberDto'];

/** `AppSheet`'s floating-sheet gap above the home indicator / keyboard. */
const FLOATING_INSET = 9;

export interface VaultTransactionDetailScreenProps {
  detail: VaultTransactionDetail;
  /** Required together to offer "Edit details" on a confirmed spend. */
  tripId?: number;
  vaultTransactionId?: number;
  members?: readonly TripMemberDto[];
  /** False after the trip has ended — server rejects edits then. */
  allowsEditing?: boolean;
  onBack: () => void;
  onSendAgain?: () => void;
  onApproved?: () => void;
  onCancelled?: () => void;
  onEdited?: (updated: VaultTransactionDetailDto, savedName: string) => void;
  /** Status-bar inset to clear when shown full-screen (pay flow); 0 inside a sheet. */
  topInset?: number;
}

export function VaultTransactionDetailScreen({
  detail: initialDetail,
  tripId,
  vaultTransactionId,
  members = [],
  allowsEditing = true,
  onBack,
  onSendAgain,
  onApproved,
  onCancelled,
  onEdited,
  topInset = 0,
}: VaultTransactionDetailScreenProps) {
  useAppLanguage();
  const { t } = useTranslation();

  const [detail, setDetail] = useState(initialDetail);
  const [isEditing, setIsEditing] = useState(false);
  const editSheetRef = useRef<AppSheetRef>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const approve = useApproveVaultTransaction(tripId ?? 0);
  const cancel = useCancelVaultTransaction(tripId ?? 0);

  const showsApprove = detail.canApprove;
  const showsCancel = detail.canCancel;
  const showsEdit =
    allowsEditing &&
    detail.canEdit &&
    detail.status === 'completed' &&
    tripId != null &&
    vaultTransactionId != null;

  async function handleApprove() {
    if (vaultTransactionId == null) return;
    setErrorMessage(null);
    try {
      await approve.mutateAsync({ vaultTransactionId });
      onApproved?.();
    } catch (err) {
      setErrorMessage(actionErrorMessage(err, t('Could not approve the payment.')));
    }
  }

  function confirmCancel() {
    Alert.alert(t('Cancel this payment?'), t('The proposal will be dropped. No money moves.'), [
      { text: t('Keep waiting'), style: 'cancel' },
      {
        text: t('Cancel payment'),
        style: 'destructive',
        onPress: () => {
          void handleCancel();
        },
      },
    ]);
  }

  async function handleCancel() {
    if (vaultTransactionId == null) return;
    setErrorMessage(null);
    try {
      await cancel.mutateAsync({ vaultTransactionId });
      onCancelled?.();
    } catch (err) {
      setErrorMessage(actionErrorMessage(err, t('Could not cancel the payment.')));
    }
  }

  /** null = say nothing (the member cancelled in their wallet). */
  function actionErrorMessage(err: unknown, fallback: string): string | null {
    if (err instanceof WalletError && err.kind === 'cancelled') return null;
    return walletErrorMessage(t, err) ?? vaultPayErrorMessage(err, fallback);
  }

  return (
    <View style={styles.container}>
      {/* Rendered first so it paints as the background — RN stacks later siblings on top,
          unlike SwiftUI's `.background { gradient }` which paints behind its content. */}
      <VaultSkyGradient />

      <View style={{ height: topInset }} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.amount} numberOfLines={1}>
            {CurrencyFormatter.formatWhole(detail.amountVnd)}đ
          </Text>
          <Text style={styles.transferTo}>
            <Text style={styles.transferToDim}>{t('Transfer to ')}</Text>
            <Text style={styles.transferToName}>{detail.recipientName}</Text>
          </Text>

          {showsApprove ? (
            <Pressable
              onPress={handleApprove}
              disabled={approve.isPending || cancel.isPending}
              style={styles.approveButton}
              testID="vault-detail-approve"
              accessibilityRole="button"
              accessibilityLabel={t('Approve payment')}
              accessibilityState={{
                busy: approve.isPending,
                disabled: approve.isPending || cancel.isPending,
              }}
            >
              {approve.isPending ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.approveLabel}>{t('Approve payment')}</Text>
              )}
            </Pressable>
          ) : detail.needsApproval ? (
            <Text style={styles.waitingLabel}>{t('Waiting for another member to approve')}</Text>
          ) : null}

          {showsCancel ? (
            <Pressable
              onPress={confirmCancel}
              disabled={approve.isPending || cancel.isPending}
              style={styles.cancelButton}
              testID="vault-detail-cancel"
              accessibilityRole="button"
              accessibilityLabel={t('Cancel payment')}
              accessibilityState={{
                busy: cancel.isPending,
                disabled: approve.isPending || cancel.isPending,
              }}
            >
              {cancel.isPending ? (
                <ActivityIndicator color={colors.secondary} />
              ) : (
                <Text style={styles.cancelLabel}>{t('Cancel payment')}</Text>
              )}
            </Pressable>
          ) : null}

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        </View>

        <View style={styles.detailsShell}>
          <View style={styles.paymentCard}>
            <Row label={t('Status')}>
              <View style={styles.statusRow}>
                <Ionicons
                  name={statusIcon(detail.status)}
                  size={16}
                  color={statusColor(detail.status)}
                />
                <Text style={styles.value}>{statusTitle(detail.status, t)}</Text>
              </View>
            </Row>
            <Row label={t('Date')}>
              <Text style={styles.value}>{formatDate(detail.createdAt)}</Text>
            </Row>
            <Row label={t('Bank name')}>
              <Text style={styles.value}>{detail.bankName}</Text>
            </Row>
            <Row label={t('Bank account number')}>
              <Text style={styles.value}>{detail.bankAccountNumber}</Text>
            </Row>
            <Row label={t('Recipient name')}>
              <Text style={styles.value}>{detail.recipientName}</Text>
            </Row>
            <Row label={feeLabel(detail.feePercent, t)}>
              <Text style={styles.value}>{CurrencyFormatter.formatWhole(detail.feeVnd)}đ</Text>
            </Row>
            <Row label={t('Rate')}>
              <Text style={styles.value}>
                {`1 USDC = ${CurrencyFormatter.formatWhole(detail.rate)}đ`}
              </Text>
            </Row>
            {detail.note ? (
              <>
                <View style={styles.divider} />
                <View>
                  <Text style={styles.noteLabel}>{t('Note')}</Text>
                  <Text style={styles.noteValue}>{detail.note}</Text>
                </View>
              </>
            ) : null}
          </View>

          <View style={styles.groupDetails}>
            <View style={styles.groupHeaderRow}>
              <Text style={styles.groupTitle}>{t('Group details')}</Text>
              {showsEdit ? (
                <Pressable
                  onPress={() => {
                    setIsEditing(true);
                    editSheetRef.current?.present();
                  }}
                  style={styles.editButton}
                  testID="vault-detail-edit"
                >
                  <Text style={styles.editLabel}>{t('Edit details')}</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.groupCard}>
              {detail.paidByName ? (
                <Row label={t('Paid by')}>
                  <Pill text={detail.paidByName} tint={colors.warning500} />
                </Row>
              ) : null}
              <Row label={t('Share with')}>
                <Pill text={shareWithLabel(detail.shareWithNames, t)} tint={colors.blueBase} />
              </Row>
              <Row label={t('Category')}>
                <View style={styles.statusRow}>
                  <CategoryIcon category={detail.category} size={24} />
                  <Text style={styles.value}>{t(categoryOption(detail.category).title)}</Text>
                </View>
              </Row>
              <Row label={t('Created by')}>
                <View style={styles.statusRow}>
                  <Avatar uri={detail.madeByAvatarUrl} size={19} />
                  <Text style={styles.value}>{detail.madeByName}</Text>
                </View>
              </Row>
            </View>
          </View>

          {detail.feeUsdc > 0 ? (
            <Text style={styles.feeFooter}>
              {t('%@ paid for one time payment', { 0: `$${detail.feeUsdc.toFixed(2)}` })}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      {/* Same bottom bar as the deposit / withdraw receipts. */}
      <View style={styles.bottomBar}>
        {onSendAgain ? (
          <Pressable
            onPress={onSendAgain}
            style={styles.sendAgainButton}
            accessibilityRole="button"
            testID="vault-detail-send-again"
          >
            <Text style={styles.sendAgainLabel}>{t('Send again')}</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onBack}
          style={styles.goBackButton}
          accessibilityRole="button"
          testID="vault-detail-go-back"
        >
          <Text style={styles.goBackLabel}>{t('Go back')}</Text>
        </Pressable>
      </View>

      {/* Content-sized floating sheet: gorhom's `interactive` keyboard offset already lifts it
          above the keyboard. Don't add `EditDisplayNameSheet`'s keyboard-height `bottomInset`
          on top — that lifts it twice. */}
      <AppSheet
        ref={editSheetRef}
        enableDynamicSizing
        bottomInset={FLOATING_INSET}
        android_keyboardInputMode="adjustPan"
        backgroundColor={colors.background}
        onDismiss={() => setIsEditing(false)}
      >
        <BottomSheetView>
          {isEditing && tripId != null && vaultTransactionId != null ? (
            <VaultTransactionEditScreen
              tripId={tripId}
              vaultTransactionId={vaultTransactionId}
              amountVnd={detail.amountVnd}
              rate={detail.rate}
              members={members}
              initialName={detail.name}
              initialCategory={detail.category}
              initialShareWithUserIds={detail.shareWithUserIds}
              onSaved={(updated, savedName) => {
                setDetail((current) => ({
                  ...current,
                  name: savedName,
                  category: categoryOption(updated.category).value,
                  shareWithNames: updated.shareWith.map((m) => m.displayName),
                  shareWithUserIds: updated.shareWith.map((m) => m.userId),
                }));
                editSheetRef.current?.dismiss();
                onEdited?.(updated, savedName);
              }}
            />
          ) : null}
        </BottomSheetView>
      </AppSheet>
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

function Pill({ text, tint }: { text: string; tint: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: tint }]}>
      <Text style={styles.pillText} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function shareWithLabel(names: readonly string[], t: TranslateFn): string {
  if (names.length === 0) return t('All');
  if (names.length === 1) return names[0] as string;
  return t('%lld people', { count: names.length });
}

function feeLabel(feePercent: number, t: TranslateFn): string {
  const trimmed = feePercent.toFixed(2).replace(/0$/, '').replace(/\.$/, '');
  return t('Fee (%@%%)', { 0: trimmed });
}

function statusTitle(status: VaultTransactionDetail['status'], t: (key: string) => string): string {
  switch (status) {
    case 'completed':
      return t('Completed');
    case 'pending':
      return t('Processing');
    case 'failed':
      return t('Failed');
  }
}

function statusIcon(status: VaultTransactionDetail['status']): keyof typeof Ionicons.glyphMap {
  switch (status) {
    case 'completed':
      return 'checkmark-circle';
    case 'pending':
      return 'time';
    case 'failed':
      return 'alert-circle';
  }
}

function statusColor(status: VaultTransactionDetail['status']): string {
  switch (status) {
    case 'completed':
      return colors.green400;
    case 'pending':
      return colors.warning500;
    case 'failed':
      return colors.secondary;
  }
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
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

const shellFill = 'rgb(239, 239, 239)';
const valueInk = 'rgb(57, 57, 57)';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: 24 },
  hero: { alignItems: 'center', gap: 20, paddingTop: 28 },
  amount: { ...beVietnamPro(48), letterSpacing: -2.4, color: colors.neutral950 },
  transferTo: { ...beVietnamPro(18), letterSpacing: -0.36 },
  transferToDim: { color: colors.neutral600 },
  transferToName: { color: colors.contentB },
  approveButton: {
    width: 180,
    height: 44,
    borderRadius: 999,
    backgroundColor: VaultPalette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveLabel: { ...beVietnamPro(15), letterSpacing: -0.75, color: colors.white },
  waitingLabel: { ...beVietnamPro(14), color: colors.warning500 },
  cancelButton: { minWidth: 147, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancelLabel: { ...beVietnamPro(15), color: colors.secondary },
  bottomBar: { flexDirection: 'row', gap: 12, marginHorizontal: 24, marginBottom: 32 },
  sendAgainButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendAgainLabel: { ...beVietnamPro(17, 'regular'), letterSpacing: -0.68, color: colors.contentB },
  goBackButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: colors.neutral900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goBackLabel: { ...beVietnamPro(17, 'regular'), letterSpacing: -0.68, color: colors.white },
  error: { ...beVietnamPro(13), color: colors.secondary, textAlign: 'center' },
  detailsShell: {
    marginTop: 20,
    marginHorizontal: 7,
    gap: 16,
    padding: 8,
    borderRadius: 26,
    backgroundColor: shellFill,
  },
  paymentCard: { gap: 16, padding: 16, borderRadius: 18, backgroundColor: colors.white },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowLabel: { ...beVietnamPro(15), letterSpacing: -0.45, color: colors.contentM },
  value: { ...beVietnamPro(16), letterSpacing: -0.32, color: valueInk },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  divider: { height: 1, backgroundColor: colors.neutral100 },
  noteLabel: { ...beVietnamPro(15), letterSpacing: -0.45, color: colors.contentM, marginBottom: 8 },
  noteValue: { ...beVietnamPro(16, 'medium'), letterSpacing: -0.32, color: valueInk },
  groupDetails: { gap: 6 },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  groupTitle: { ...beVietnamPro(16), letterSpacing: -0.32, color: colors.contentB },
  editButton: {
    paddingHorizontal: 8,
    paddingTop: 2,
    paddingBottom: 3,
    borderRadius: 999,
    backgroundColor: colors.neutral900,
  },
  editLabel: { ...beVietnamPro(14), letterSpacing: -0.28, color: colors.background },
  groupCard: { gap: 16, padding: 16, borderRadius: 18, backgroundColor: colors.white },
  pill: { paddingHorizontal: 8, paddingTop: 2, paddingBottom: 3, borderRadius: 999 },
  pillText: { ...beVietnamPro(14), letterSpacing: -0.28, color: colors.background },
  feeFooter: { ...beVietnamPro(14), letterSpacing: -0.28, color: valueInk, textAlign: 'center' },
});
