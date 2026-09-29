/**
 * End-trip consensus: review ledger, Approve/Deny — port of
 * `ios/OnePlan/OnePlan/View/Trip/TripEnd/TripEndReviewView.swift`. Figma `4569:1596`.
 *
 * TODO(web3): the ledger rows below are a local stopgap, not the shared `VaultHistoryRow`
 * (Wave C, not built yet — `docs/web3/rn-ui-parity-inventory.md` `vault-history-row`). Swap this
 * screen to the real component once Wave C lands; don't grow this row further in the meantime.
 */
import { useEffect } from 'react';
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

import { deviceUses24hourClock, useAppLanguage } from '@/i18n';
import { formatUsdc, formatWhole } from '@/lib/currency';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import { useExchangeRate } from '@/features/exchange/useExchangeRate';
import { PioneerAvatar } from '@/features/settlement/components/PioneerAvatar';
import { CategoryIcon } from '@/features/vault/components/CategoryIcon';
import { PersonAvatar } from '@/features/vault/components/PersonAvatar';
import { TripEndBackHeader } from '@/features/vault/components/TripEndConsensusChrome';
import {
  useCastTripEndVote,
  useTripEndReview,
  type CashDebtDto,
  type TripEndRequestDto,
} from '@/features/vault/api/endTrip';
import {
  historyCurrencyOf,
  historyTotalOf,
  mapHistoryEntry,
  type ReviewHistoryEntry,
} from '@/features/vault/helpers/tripEndHistory';
import {
  FALLBACK_USDC_TO_VND,
  settlementNetUsdc,
} from '@/features/vault/helpers/tripEndSettlement';

export interface TripEndReviewScreenProps {
  tripId: number;
  myUserId: number | undefined;
  coverImageUrl?: string | null;
  onApproved: (request: TripEndRequestDto) => void;
  onDenied: (request: TripEndRequestDto) => void;
  onBack: () => void;
}

function formatSignedUsd(value: number): string {
  const sign = value < 0 ? '-' : value > 0 ? '+' : '';
  return `${sign}$${formatUsdc(Math.abs(value))}`;
}

function formatSignedVnd(value: number): string {
  const sign = value < 0 ? '-' : value > 0 ? '+' : '';
  return `${sign}đ${formatWhole(Math.abs(value))}`;
}

export function TripEndReviewScreen({
  tripId,
  myUserId,
  coverImageUrl,
  onApproved,
  onDenied,
  onBack,
}: TripEndReviewScreenProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const review = useTripEndReview(tripId);
  const vote = useCastTripEndVote(tripId);
  const rate = useExchangeRate('USD', 'VND');
  const usdcToVnd = rate.data?.rate && rate.data.rate > 0 ? rate.data.rate : FALLBACK_USDC_TO_VND;
  const uses24hourClock = deviceUses24hourClock();

  useEffect(() => {
    if (!review.isError) return;
    const message = review.error instanceof Error ? review.error.message : '';
    Alert.alert(t('Could not load review'), message, [{ text: t('OK') }]);
    // Only the transition into an error state should alert — not every re-render while it holds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review.isError]);

  const historyEntries: ReviewHistoryEntry[] = (review.data?.history ?? []).map((entry) =>
    mapHistoryEntry(entry, uses24hourClock),
  );
  const historyCurrency = historyCurrencyOf(historyEntries);
  const historyTotal = historyTotalOf(historyEntries);
  const mySettlement = review.data?.mySettlement ?? [];
  const settlementTotal = settlementNetUsdc(mySettlement, myUserId ?? 0);
  const isWorking = vote.isPending;

  const handleVote = (decision: 'APPROVED' | 'DENIED') => {
    vote.mutate(decision, {
      onSuccess: (result) => {
        if (decision === 'DENIED' || result.status === 'DENIED') onDenied(result);
        else onApproved(result);
      },
      onError: (err) => Alert.alert(err instanceof Error ? err.message : t('Please try again')),
    });
  };

  return (
    <View style={styles.root} testID="trip-end-review-screen">
      <TripEndBackHeader onBack={onBack} />

      {!review.data ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.blueBase} />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.hero}>
              <PioneerAvatar imageUrl={coverImageUrl} size={140} />
              <View style={styles.heroCopy}>
                <Text style={styles.heroTitle}>{t('You are preparing to end your trip.')}</Text>
                <Text style={styles.heroBody}>
                  {t(
                    'Please review the transaction details below. Select "Approve" if you participated in all the listed transactions. Select "Deny" if the information is incorrect, then notify the host to make corrections.',
                  )}
                </Text>
              </View>
            </View>

            <View style={styles.sections}>
              <SectionCaption
                title={t('History')}
                total={
                  historyCurrency === 'USD'
                    ? formatSignedUsd(historyTotal)
                    : formatSignedVnd(historyTotal)
                }
              />
              {historyEntries.length === 0 ? (
                <Text style={styles.emptyText}>{t('No vault activity yet')}</Text>
              ) : (
                <View style={styles.card}>
                  {historyEntries.map((entry, index) => (
                    <View key={entry.id}>
                      {index > 0 ? <View style={styles.divider} /> : null}
                      <ReviewHistoryRow entry={entry} />
                    </View>
                  ))}
                </View>
              )}

              <SectionCaption title={t('Settlement')} total={formatSignedUsd(settlementTotal)} />
              {mySettlement.length === 0 ? (
                <Text style={styles.emptyText}>{t('Nothing left to settle in cash')}</Text>
              ) : (
                <View style={styles.settlementCard}>
                  {mySettlement.map((debt) => (
                    <SettlementRow
                      key={`${debt.fromUserId}-${debt.toUserId}`}
                      debt={debt}
                      myUserId={myUserId ?? 0}
                      usdcToVnd={usdcToVnd}
                      members={review.data?.request.members ?? []}
                    />
                  ))}
                </View>
              )}
            </View>
          </ScrollView>

          <View style={styles.voteBar}>
            <VoteButton
              label={t('Deny')}
              tone="black"
              disabled={isWorking}
              onPress={() => handleVote('DENIED')}
              testID="trip-end-review-deny"
            />
            <VoteButton
              label={isWorking ? '…' : t('Approve')}
              tone="accent"
              disabled={isWorking}
              onPress={() => handleVote('APPROVED')}
              testID="trip-end-review-approve"
            />
          </View>
        </>
      )}
    </View>
  );
}

function SectionCaption({ title, total }: { title: string; total: string }) {
  return (
    <View style={styles.sectionCaption}>
      <Text style={styles.sectionCaptionText}>{title}</Text>
      <Text style={styles.sectionCaptionText}>{total}</Text>
    </View>
  );
}

function ReviewHistoryRow({ entry }: { entry: ReviewHistoryEntry }) {
  const { t } = useTranslation();
  const title =
    entry.title ??
    (entry.kind === 'deposit'
      ? t('Deposit')
      : entry.kind === 'settlement'
        ? t('Settlement')
        : t('Payment'));
  const sign = entry.amount < 0 ? '-' : '+';
  const amountLabel =
    entry.currency === 'USD'
      ? `${sign}${formatUsdc(Math.abs(entry.amount))} USDC`
      : `${sign}${formatWhole(Math.abs(entry.amount))}đ`;

  return (
    <View style={styles.historyRow} testID="trip-end-review-history-row">
      <View style={styles.historyIcon}>
        {entry.category ? (
          <CategoryIcon category={entry.category} size={36} />
        ) : (
          <View style={styles.historyIconFallback}>
            <Text style={styles.historyIconFallbackText}>{entry.kind === 'deposit' ? '↓' : '↑'}</Text>
          </View>
        )}
      </View>
      <View style={styles.historyRowBody}>
        <Text style={styles.historyRowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.historyRowTime}>
          {entry.isAwaitingApproval ? t('Needs approval') : entry.time}
        </Text>
      </View>
      <Text
        style={[
          styles.historyRowAmount,
          entry.isAwaitingApproval && styles.historyRowAmountMuted,
        ]}
      >
        {amountLabel}
      </Text>
    </View>
  );
}

function SettlementRow({
  debt,
  myUserId,
  usdcToVnd,
  members,
}: {
  debt: CashDebtDto;
  myUserId: number;
  usdcToVnd: number;
  members: readonly { userId: number; avatarUrl?: string | null }[];
}) {
  const isReceiving = debt.toUserId === myUserId;
  const counterpartId = isReceiving ? debt.fromUserId : debt.toUserId;
  const counterpartName = isReceiving ? debt.fromDisplayName : debt.toDisplayName;
  const avatarUrl = members.find((m) => m.userId === counterpartId)?.avatarUrl;
  const usdc = Number(debt.amountMicro) / 1_000_000;
  const sign = isReceiving ? '+' : '-';
  const { t } = useTranslation();

  return (
    <View style={styles.settlementRow} testID="trip-end-review-settlement-row">
      <PersonAvatar uri={avatarUrl} name={counterpartName} size={52} />
      <View style={styles.settlementRowBody}>
        <Text style={styles.settlementRowLabel}>{isReceiving ? t('Receive from') : t('Pay')}</Text>
        <Text style={styles.settlementRowName} numberOfLines={1}>
          {counterpartName}
        </Text>
      </View>
      <View style={styles.settlementRowAmount}>
        <View style={styles.settlementRowAmountLine}>
          <Text style={styles.settlementUsdc}>{sign}{formatUsdc(usdc)}</Text>
          <Text style={styles.settlementUsdcUnit}>USDC</Text>
        </View>
        <Text style={styles.settlementVnd}>
          {sign}{formatWhole(usdc * usdcToVnd)}đ
        </Text>
      </View>
    </View>
  );
}

function VoteButton({
  label,
  tone,
  disabled,
  onPress,
  testID,
}: {
  label: string;
  tone: 'black' | 'accent';
  disabled: boolean;
  onPress: () => void;
  testID: string;
}) {
  const style = tone === 'black' ? styles.voteButtonBlack : styles.voteButtonAccent;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.voteButton, style, disabled && styles.voteButtonDisabled]}
      testID={testID}
    >
      <Text style={styles.voteButtonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 12, paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: 28 },
  hero: { alignItems: 'center', gap: 28 },
  heroCopy: { gap: 3, alignItems: 'center' },
  heroTitle: {
    ...beVietnamPro(20),
    color: colors.neutral950,
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  heroBody: {
    ...beVietnamPro(14),
    color: colors.contentM,
    letterSpacing: -0.42,
    textAlign: 'center',
  },
  sections: { gap: spacing.sm },
  sectionCaption: { flexDirection: 'row', justifyContent: 'space-between' },
  sectionCaptionText: { ...beVietnamPro(14), color: colors.contentM, letterSpacing: -0.28 },
  emptyText: { ...beVietnamPro(14), color: colors.contentM, paddingVertical: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.xxl, paddingVertical: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.dividerStroke, marginLeft: 56 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
  historyIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  historyIconFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.neutral200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyIconFallbackText: { ...beVietnamPro(16), color: colors.contentM },
  historyRowBody: { flex: 1, gap: 2 },
  historyRowTitle: { ...beVietnamPro(15), color: colors.contentB },
  historyRowTime: { ...beVietnamPro(12), color: colors.contentL },
  historyRowAmount: { ...beVietnamPro(15), color: colors.contentB },
  historyRowAmountMuted: { color: colors.contentL },
  settlementCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.white,
    gap: spacing.xs,
  },
  settlementRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  settlementRowBody: { flex: 1, gap: 2 },
  settlementRowLabel: { ...beVietnamPro(14), color: colors.neutral700, letterSpacing: -0.28 },
  settlementRowName: { ...beVietnamPro(16, 'medium'), color: colors.contentB, letterSpacing: -0.32 },
  settlementRowAmount: { alignItems: 'flex-end', gap: 2 },
  settlementRowAmountLine: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  settlementUsdc: { ...beVietnamPro(18), color: colors.contentB, letterSpacing: -0.36 },
  settlementUsdcUnit: { ...beVietnamPro(18), color: colors.contentL, letterSpacing: -0.36 },
  settlementVnd: { ...beVietnamPro(14), color: colors.contentM, letterSpacing: -0.28 },
  voteBar: {
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
  },
  voteButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voteButtonLabel: { ...beVietnamPro(17), color: colors.white, letterSpacing: -0.68 },
  voteButtonBlack: { backgroundColor: colors.black },
  voteButtonAccent: { backgroundColor: 'rgb(72, 184, 254)' },
  voteButtonDisabled: { opacity: 0.5 },
});
