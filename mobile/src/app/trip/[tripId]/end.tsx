/**
 * End-of-trip recap — port of `ios/OnePlan/OnePlan/View/Trip/TripEnd/TripEndView.swift`.
 * The iOS `TabView` becomes a floating `TripEndTabBar` (History / Breakdown) over a shared
 * background gradient; the tab bodies live in `TripEndHistoryTab.tsx` / `TripEndBreakdownTab`.
 * Like iOS, the toolbar has no title — just the back chevron and the owner's glass trash button,
 * floating over the scrolling content like the tab header.
 *
 * `mode` decides where "back" goes and what the Breakdown tab renders:
 *   `flow`    — just ended the trip → back returns to Home.
 *   `ended`   — opened from the Ended list → back pops the stack.
 *   `leaving` — the member already left; the trip detail now 403s, so everything renders from
 *               the `settlement` route param plus whatever is still cached (`trip` may be
 *               undefined and every read below tolerates that).
 *
 * The body is one `FlashList`: the History tab's hero/cards/title sit in the list header and its
 * day headers + entries are the (virtualized, read-only) rows; the Breakdown tab is one row.
 */
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mutationErrorMessage } from '@/api/mutationError';
import { useMe } from '@/features/me/useMe';
import { useAllTripPhotos } from '@/features/photos/useAllTripPhotos';
import {
  historyRowInset,
  historyTitleGap,
  type RatingSheetRef,
  TripEndBreakdownTab,
  TripEndHistoryHeader,
  TripEndRatingSheet,
  type TripEndTab,
  TripEndTabBar,
  tripEndTabBarHeight,
} from '@/features/settlement/components';
import {
  parseLeaveSettlement,
  type TripEndMode,
} from '@/features/settlement/helpers/settlementModel';
import { invalidateTripLists, useDeleteTrip } from '@/features/trip/api/mutations';
import {
  flattenHistorySections,
  HistoryListRow,
  type HistoryRow,
} from '@/features/trip/components/TripHistoryList';
import { tripMoney } from '@/features/trip/helpers/tripMoney';
import { useTripDetail } from '@/features/trip/TripDetailContext';
import { useHistorySections } from '@/features/trip/useHistorySections';
import { useVaultBalance } from '@/features/vault/api/queries';
import { useTripHasVault } from '@/features/vault/api/tripHasVault';
import {
  alertVaultNotEmpty,
  isVaultNotEmptyError,
  vaultBlocksDelete,
} from '@/features/vault/deleteGuard';
import { FALLBACK_USDC_TO_VND } from '@/features/vault/helpers/tripEndSettlement';
import { VaultHistoryView } from '@/features/vault/screens/VaultHistoryView';
import { VaultSettlementScreen } from '@/features/vault/screens/VaultSettlementScreen';
import { useWeb3Enabled } from '@/features/vault/web3Flag';
import { deviceUses24hourClock, useAppLanguage } from '@/i18n';
import { formatWhole } from '@/lib/currency';
import { OfflineBanner, Spinner } from '@/ui/components';
import { BackButton } from '@/ui/components/BackButton';
import { GLASS_ICON_BUTTON_SIZE, GlassIconButton } from '@/ui/components/GlassIconButton';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const GRADIENT = ['rgb(214, 227, 255)', colors.background] as const;
/** Tab-switch cross-fade of the body (≈ the iOS `TabView` transition). */
const FADE_MS = 220;

/** The single row holding a vault trip's History (the vault ledger). */
const VAULT_HISTORY_ROW = 'tab:vault-history';

/** A read-only History row, or the single row holding the Breakdown tab / vault history. */
type EndRow = HistoryRow | { type: 'tab'; key: string };

export default function TripEndScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const detail = useTripDetail();
  const me = useMe();
  const params = useLocalSearchParams<{ tripId: string; mode?: string; settlement?: string }>();
  const deleteTrip = useDeleteTrip();
  const [tab, setTab] = useState<TripEndTab>('history');
  const ratingRef = useRef<RatingSheetRef>(null);
  const [localRating, setLocalRating] = useState<number | null>(null);
  // The body fades in on mount and on every tab switch. A keyed `entering` animation can't do
  // this for list rows (FlashList recycles cells instead of remounting them), so every piece of
  // tab content shares one opacity: reset in `changeTab`, animated back after the commit.
  const fade = useSharedValue(0);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.get() }));
  useEffect(() => {
    fade.set(withTiming(1, { duration: FADE_MS }));
  }, [tab, fade]);
  const changeTab = (next: TripEndTab) => {
    if (next === tab) return;
    fade.set(0);
    setTab(next);
  };

  const mode: TripEndMode =
    params.mode === 'ended' || params.mode === 'leaving' ? params.mode : 'flow';
  const leaveSettlement = useMemo(
    () => parseLeaveSettlement(params.settlement),
    [params.settlement],
  );

  const { trip, tripId, budgets, expenses, breakdown, homeCurrency, members } = detail;
  const money = tripMoney(budgets, expenses);
  // Drained, not just the first page: the album card reports the whole count and
  // `Download all` needs the real total (`useAllTripPhotos`).
  const photos = useAllTripPhotos(tripId);

  // Vault trips settle through cash debts (`VaultSettlementScreen`), not the classic pairwise
  // breakdown — and rename the second tab to "Settlement" (`TripEndView.swift` tab label + the
  // "Trip Balance" toolbar chip). A leaving member always keeps the classic breakdown (their own
  // card travels in the `settlement` route param, same as before web3).
  const web3Enabled = useWeb3Enabled(tripId);
  const { hasVault } = useTripHasVault(tripId, { enabled: web3Enabled && mode !== 'leaving' });
  const usesVaultSettlement = web3Enabled && hasVault && mode !== 'leaving';
  const vaultBalance = useVaultBalance(tripId, { enabled: web3Enabled && hasVault });
  const tripBalanceChipText =
    web3Enabled && hasVault && vaultBalance.data
      ? t('Trip Balance +{{0}}', {
          0: formatWhole(
            (Number(vaultBalance.data.balanceMicro) / 1_000_000) * FALLBACK_USDC_TO_VND,
          ),
        })
      : null;
  const sections = useHistorySections(detail);
  const historyRows = useMemo(() => flattenHistorySections(sections), [sections]);
  // A vault trip's History is the vault ledger (deposits + payments, read-only), like iOS
  // `TripEndHistory.usesVaultHistory` — the classic expense rows miss vault-side edits.
  const usesVaultHistory = usesVaultSettlement;
  const hasHistory = usesVaultHistory || historyRows.length > 0;
  const rows: EndRow[] =
    tab !== 'history'
      ? [{ type: 'tab', key: 'tab:breakdown' }]
      : usesVaultHistory
        ? [{ type: 'tab', key: VAULT_HISTORY_ROW }]
        : historyRows;
  // One native read per render for every row's time label.
  const uses24hourClock = deviceUses24hourClock();

  const goHome = () => {
    void invalidateTripLists(queryClient);
    router.dismissTo('/(tabs)/home');
  };
  const handleBack = () => (mode === 'ended' ? router.back() : goHome());

  const headerTop = insets.top + 6;
  const isOwner = trip != null && me.data?.id === trip.createdById;
  const handleDelete = async () => {
    if (web3Enabled && (await vaultBlocksDelete(queryClient, tripId))) {
      alertVaultNotEmpty(t);
      return;
    }
    Alert.alert(
      t('Delete trip?'),
      t('This will permanently delete the trip for all members. This action cannot be undone.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: () =>
            deleteTrip.mutate(tripId, {
              onSuccess: () =>
                mode === 'ended' ? router.back() : router.dismissTo('/(tabs)/home'),
              onError: (err) =>
                isVaultNotEmptyError(err)
                  ? alertVaultNotEmpty(t)
                  : Alert.alert(mutationErrorMessage(err, t('Failed to delete trip'))),
            }),
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={GRADIENT} locations={[0, 0.27]} style={StyleSheet.absoluteFill} />

      <FlashList
        data={rows}
        renderItem={({ item }) =>
          item.type === 'tab' && item.key === VAULT_HISTORY_ROW ? (
            <Animated.View style={[fadeStyle, styles.historyRow]}>
              <VaultHistoryView
                tripId={tripId}
                allowsEditing={false}
                embedsInParentScroll
              />
            </Animated.View>
          ) : item.type === 'tab' ? (
            <Animated.View style={fadeStyle}>
              {usesVaultSettlement ? (
                <VaultSettlementScreen
                  tripId={tripId}
                  coverImageUrl={trip?.coverImageUrl}
                  totalSpent={breakdown?.totalSpent ?? money.totalSpent}
                  currency={homeCurrency}
                  members={members}
                  myUserId={me.data?.id}
                />
              ) : (
                <TripEndBreakdownTab
                  tripId={tripId}
                  mode={mode}
                  currency={homeCurrency}
                  coverImageUrl={trip?.coverImageUrl}
                  breakdown={mode === 'leaving' ? undefined : breakdown}
                  fallbackTotalSpent={money.totalSpent}
                  fallbackUnsettled={money.unsettledPaymentCount}
                  members={members}
                  currentUserId={me.data?.id}
                  currentUserAvatarUrl={me.data?.avatarUrl}
                  leaveSettlement={leaveSettlement}
                  onLeaveDone={goHome}
                />
              )}
            </Animated.View>
          ) : (
            <Animated.View style={fadeStyle}>
              {/* Read-only here: iOS' trip-end history has no row navigation. */}
              <HistoryListRow
                row={item}
                uses24hourClock={uses24hourClock}
                onExpensePress={() => undefined}
                expensePressDisabled
                style={styles.historyRow}
              />
            </Animated.View>
          )
        }
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.type}
        ListHeaderComponent={
          <View
            style={[
              styles.listHeader,
              {
                // The gap down to the first row: title → rows on History, banner → Breakdown.
                paddingBottom:
                  tab === 'history'
                    ? hasHistory
                      ? historyTitleGap
                      : 0
                    : detail.servingCached
                      ? spacing.xl
                      : 0,
              },
            ]}
          >
            {detail.servingCached ? (
              <OfflineBanner cachedAt={detail.cachedAt} style={styles.banner} />
            ) : null}
            {tab === 'history' ? (
              <Animated.View style={fadeStyle}>
                <TripEndHistoryHeader
                  tripId={tripId}
                  trip={trip}
                  currency={homeCurrency}
                  totalSpent={breakdown?.totalSpent ?? money.totalSpent}
                  photos={photos.photos}
                  photosDraining={photos.draining}
                  showHistoryTitle={hasHistory}
                  localRating={localRating}
                  onRate={() => ratingRef.current?.present()}
                />
              </Animated.View>
            ) : null}
          </View>
        }
        contentContainerStyle={{
          paddingTop: headerTop + GLASS_ICON_BUTTON_SIZE + spacing.sm,
          paddingBottom: tripEndTabBarHeight() + spacing.lg,
        }}
        showsVerticalScrollIndicator={false}
        // Plain-ScrollView parity: never shift the offset to pin the previously first row.
        maintainVisibleContentPosition={{ disabled: true }}
      />

      <View pointerEvents="box-none" style={[styles.header, { paddingTop: headerTop }]}>
        <View
          style={deleteTrip.isPending && styles.disabled}
          pointerEvents={deleteTrip.isPending ? 'none' : 'auto'}
        >
          <BackButton onPress={handleBack} testID="trip-end-back" />
        </View>
        <View style={styles.headerTrailing}>
          {tripBalanceChipText ? (
            <View style={styles.balanceChip} testID="trip-end-balance-chip">
              <Text style={styles.balanceChipText}>{tripBalanceChipText}</Text>
            </View>
          ) : null}
          {deleteTrip.isPending ? (
            <View style={styles.headerButton}>
              <Spinner />
            </View>
          ) : isOwner ? (
            <GlassIconButton
              label={t('Delete')}
              onPress={() => void handleDelete()}
              testID="trip-end-delete"
            >
              <Ionicons name="trash-outline" size={20} color={colors.warning500} />
            </GlassIconButton>
          ) : (
            <View style={styles.headerButton} />
          )}
        </View>
      </View>

      <TripEndTabBar
        value={tab}
        onChange={changeTab}
        breakdownLabel={usesVaultSettlement ? t('Settlement') : undefined}
      />

      <TripEndRatingSheet
        sheetRef={ratingRef}
        tripId={tripId}
        trip={trip}
        onRated={setLocalRating}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTrailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  balanceChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.55)',
  },
  balanceChipText: { ...beVietnamPro(13), color: colors.contentB },
  disabled: { opacity: 0.4 },
  listHeader: { gap: spacing.xl },
  banner: { marginHorizontal: spacing.lg },
  historyRow: { marginHorizontal: historyRowInset },
});
