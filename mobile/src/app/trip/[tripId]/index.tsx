/**
 * Trip detail — port of the shell of `ios/OnePlan/OnePlan/View/Trip/TripDetailView.swift`:
 * header, `OfflineBanner` when serving cache, `HomeCard`, `TripTabBar`, and the tab body.
 * Phase 2 shipped History, Members and Insight; Phase 3 ships Plan (M1.6) and Note (M5.2).
 *
 * One `FlashList` scrolls the whole screen: banner/card/tab bar are its list header, and the
 * rows are either the History tab's flattened day headers + entries (virtualized — a trip can
 * have hundreds) or a single `tab` row holding the other tab bodies and History's empty/loading
 * state. That row is given the viewport's leftover height so the Plan tab's empty-day card and
 * the empty-history card still stretch to the bottom (iOS `minHeight: viewport`).
 */
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { FlashList } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mutationErrorMessage } from '@/api/mutationError';
import { TripInviteCard } from '@/features/invite/components';
import { useFirstOpenInviteSheet } from '@/features/invite/useFirstOpenInviteSheet';
import { useIsPro, useMe } from '@/features/me/useMe';
import { TripNoteSection } from '@/features/note/components';
import {
  RearrangeDateSheet,
  type RearrangeDateSheetRef,
  TripPlanSection,
} from '@/features/plan/components';
import type { PlanItemDto } from '@/features/plan/types';
import { useDayOps } from '@/features/plan/useDayOps';
import { usePlanDay } from '@/features/plan/usePlanDay';
import { useStalePlanItemsRefetch } from '@/features/plan/useStalePlanItemsRefetch';
import { useLeavePreview } from '@/features/trip/api/leave';
import { invalidateTrip, useUpdateTrip } from '@/features/trip/api/mutations';
import { useTripVaultCard } from '@/features/vault/api/tripVaultCard';
import { TripVaultSection } from '@/features/vault/screens/TripVaultSection';
import { VaultHistoryView } from '@/features/vault/screens/VaultHistoryView';
import { useAnnounceVaultLeave } from '@/features/vault/api/leave';
import { useTripEndConsensus } from '@/features/vault/useTripEndConsensus';
import { useWeb3Enabled } from '@/features/vault/web3Flag';
import {
  HomeCard,
  LeaveTripSheet,
  type LeaveTripSheetRef,
  MembersSection,
  TripHistorySection,
  TripInsightSection,
  TripMenuController,
  TripTabBar,
  type TripTab,
} from '@/features/trip/components';
import {
  flattenHistorySections,
  HistoryListRow,
  type HistoryRow,
} from '@/features/trip/components/TripHistoryList';
import { resolveInsightTab } from '@/features/trip/helpers/insightGate';
import { useTripDetail } from '@/features/trip/TripDetailContext';
import { useHistorySections } from '@/features/trip/useHistorySections';
import { useTripRealtimeEffects } from '@/features/trip/useTripRealtimeEffects';
import { requestVaultContribute } from '@/features/vault/contributeHandoff';
import { VaultLeaveSheet, type VaultLeaveSheetRef } from '@/features/vault/screens';
import { deviceUses24hourClock, useAppLanguage } from '@/i18n';
import type { CurrencyCode } from '@/lib/currency';
import { pickImage } from '@/native/imagePick';
import { uploadImage } from '@/uploads/uploadService';
import {
  AppSheet,
  GlassIconButton,
  GlassIconCircle,
  OfflineBanner,
  SFSymbol,
  Spinner,
} from '@/ui/components';
import { BackButton } from '@/ui/components/BackButton';
import { colors, spacing } from '@/ui/theme';

/** A History row, or the single row that hosts any other tab body (and History's empty state). */
type DetailRow = HistoryRow | { type: 'tab'; key: string };

export default function TripDetailScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // Floating header's measured height (40pt glass buttons + paddings until first layout).
  const [headerHeight, setHeaderHeight] = useState(insets.top + 6 + 40 + 8);
  const detail = useTripDetail();
  const me = useMe();
  const isPro = useIsPro();
  const queryClient = useQueryClient();
  const navigationParams = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<TripTab>(navigationParams.tab === 'plan' ? 'plan' : 'history');
  useFocusEffect(
    useCallback(() => {
      if (navigationParams.tab === 'plan') {
        setTab('plan');
        router.setParams({ tab: undefined });
      }
    }, [navigationParams.tab]),
  );
  // Last tab selected before Insight, so a revoked/lapsed Pro state (checked on refocus, below)
  // has somewhere to fall back to (`handleInsightPaywallClosed`, TripDetailView.swift:1427-1451).
  const [prevTab, setPrevTab] = useState<TripTab>('history');
  // Lazy-loads the Note tab's query only after it's first selected (mirrors iOS's
  // fetch-on-first-visit `NoteService`), then keeps it armed so re-selecting the tab never
  // reflashes empty (`useTripNotes`'s `enabled` gate + staleTime handle the caching).
  const [notesArmed, setNotesArmed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Viewport and list-header heights; their difference is what the `tab` row fills.
  const [listHeight, setListHeight] = useState(0);
  const [listHeaderHeight, setListHeaderHeight] = useState(0);
  const [coverUploading, setCoverUploading] = useState(false);
  const updateTrip = useUpdateTrip(detail.tripId);
  const leaveSheetRef = useRef<LeaveTripSheetRef>(null);
  const vaultLeaveSheetRef = useRef<VaultLeaveSheetRef>(null);
  const rearrangeSheetRef = useRef<RearrangeDateSheetRef>(null);
  const planDay = usePlanDay(detail);
  const dayOps = useDayOps(detail.tripId, { bumpLocalDayCount: planDay.bumpLocalDayCount });

  const { trip, tripId, access } = detail;
  const isCreator = me.data?.id != null && me.data.id === trip?.createdById;
  // Realtime `tripEnded` → trip-end recap; `tripDeleted` → alert + Home; `tripMemberRemoved`
  // (when it's me) → leave (Wave E, `TripDetailView.swift`'s `tripMemberRemoved` observer).
  useTripRealtimeEffects(tripId, isCreator, me.data?.id);
  // `hasVault` also decides which leave sheet TripDetailView presents ('Leave trip' →
  // `VaultLeaveBottomSheet` vs the classic sheet) — the existing classic `getLeavePreview` already
  // carries it (`docs/web3/rn-ui-parity-inventory.md`, `vault-leave-bottom-sheet` row). Only
  // fetched with the flag on, so a non-web3 build never adds this request.
  const web3Enabled = useWeb3Enabled(tripId);
  const vaultLeavePreview = useLeavePreview(tripId, { enabled: web3Enabled });
  const hasVault = web3Enabled && vaultLeavePreview.data?.hasVault === true;
  // One-shot QR/share sheet on the creator's first open (TripDetailView.swift:1540-1558).
  const inviteSheetRef = useFirstOpenInviteSheet(trip);

  // Plan items can go stale while the user is on another tab/screen (e.g. after adding a plan
  // item from the placeholder `plan/new` route); refetch on focus when the cache is old enough.
  useStalePlanItemsRefetch(tripId);

  // Web3 vault card: only swaps in place of the classic `HomeCard` once the trip actually has a
  // vault (lazy creation — most trips never enable one). Flag OFF → `HomeCard`, and no vault or
  // USD→home exchange-rate request is made. Distinct from `hasVault` above (leave-preview-based,
  // decides the leave sheet/members prop) — both ultimately answer "does this trip have a vault",
  // via different endpoints; kept separate rather than unified across waves to avoid a cross-wave
  // behavior change here.
  const {
    hasVaultCard,
    hasVault: vaultExists,
    balanceInHomeCurrency: vaultBalanceInHome,
  } = useTripVaultCard(tripId, detail.homeCurrency.code);
  // Every member reaches end-trip Review/Waiting/Denied from here (card + realtime), not only the
  // host who raised the request from the menu.
  const endConsensus = useTripEndConsensus(tripId, vaultExists, me.data?.id);
  const announceLeave = useAnnounceVaultLeave(tripId);

  const handleRename = (name: string) => {
    updateTrip.mutate({ name });
  };

  const handlePickCover = async () => {
    const uri = await pickImage();
    if (!uri) return;
    setCoverUploading(true);
    try {
      await uploadImage({ uri, target: 'trip-cover', entityId: tripId });
    } catch {
      // Swallowed — cover upload failure just leaves the previous cover; no blocking UX (Phase 2 parity).
    } finally {
      setCoverUploading(false);
      await invalidateTrip(queryClient, tripId);
    }
  };
  const sections = useHistorySections(detail);
  const historyRows = useMemo(() => flattenHistorySections(sections), [sections]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await detail.refetchAll();
    } finally {
      setRefreshing(false);
    }
  };

  // Insight is Pro-gated (`TripDetailView.swift:1423-1451`): tapping it while not Pro pushes the
  // paywall and leaves the active tab untouched.
  const handleTabChange = (next: TripTab) => {
    if (next === 'insight' && !isPro) {
      router.push('/paywall');
      return;
    }
    if (next === 'note') setNotesArmed(true);
    setTab(next);
    if (next !== 'insight') setPrevTab(next);
  };

  // Re-check on refocus (e.g. backing out of `/paywall` without upgrading): if Insight is still
  // selected but Pro was never granted, revert to whatever tab was active before it.
  useFocusEffect(
    useCallback(() => {
      setTab((current) => resolveInsightTab({ requested: current, isPro, prevTab }));
    }, [isPro, prevTab]),
  );

  const openExpense = (expenseId: number) => {
    if (access.isOffline) {
      // Expense detail is never cached (TripDetailView.swift:1100-1102).
      Alert.alert(t('Offline'), t("You're offline\nOnly an ongoing trip can be viewed offline"));
      return;
    }
    router.push({
      pathname: '/trip/[tripId]/expense/[expenseId]',
      params: { tripId: String(tripId), expenseId: String(expenseId) },
    });
  };

  const openBudgets = () =>
    router.push({
      pathname: '/trip/[tripId]/budget',
      params: { tripId: String(tripId) },
    });

  // A vault trip's History tab is the vault's own ledger (deposits + payments, with approvals),
  // like iOS `TripDetailView.historyTab` — it renders as the single `tab` row below.
  const showsVaultHistory = tab === 'history' && vaultExists;
  // History with entries → one list row per day header / entry; anything else → one `tab` row.
  const rows: DetailRow[] =
    tab === 'history' && !showsVaultHistory && historyRows.length > 0
      ? historyRows
      : [{ type: 'tab', key: `tab:${tab}` }];
  // One native read per render for every row's time label.
  const uses24hourClock = deviceUses24hourClock();
  // iOS pads the scroll content by 10 (below the floating header / above the home indicator).
  const contentTop = headerHeight + 10;
  const contentBottom = insets.bottom + 10;
  // The rest of the viewport under the list header, so a `flexGrow` tab body (Plan's empty-day
  // card, the empty-history card) stretches to the bottom (TripDetailView.swift:282-285).
  const tabMinHeight = Math.max(0, listHeight - contentTop - listHeaderHeight - contentBottom);

  const tabBody = showsVaultHistory ? (
    <VaultHistoryView
      tripId={tripId}
      allowsEditing={access.canEdit}
      embedsInParentScroll
    />
  ) : tab === 'history' ? (
    // Only reached with no sections: the spinner or the empty card.
    <TripHistorySection
      sections={sections}
      isLoading={detail.expensesLoading}
      onExpensePress={openExpense}
      onBudgetPress={openBudgets}
      expensePressDisabled={access.isOffline}
    />
  ) : tab === 'plan' ? (
    <TripPlanSection
      detail={detail}
      planDay={planDay}
      onNewPlan={({ day, date }) =>
        router.push({
          pathname: '/trip/[tripId]/plan/new',
          params: {
            tripId: String(tripId),
            day: day != null ? String(day) : undefined,
            date: date ?? undefined,
          },
        })
      }
      onItemPress={(item: PlanItemDto) =>
        router.push({
          pathname: '/trip/[tripId]/plan/[itemId]',
          params: { tripId: String(tripId), itemId: String(item.id) },
        })
      }
      onRearrange={() => rearrangeSheetRef.current?.present()}
      onAddDay={() => void dayOps.addDay(planDay.ctx)}
      readOnly={!access.canEdit}
    />
  ) : tab === 'note' ? (
    <TripNoteSection tripId={tripId} armed={notesArmed} canEdit={access.canEdit} />
  ) : tab === 'members' ? (
    <MembersSection
      members={detail.members}
      currentUserId={me.data?.id}
      tripId={tripId}
      isCreator={isCreator}
      hasVault={hasVault}
    />
  ) : (
    <TripInsightSection
      breakdown={detail.breakdown}
      expenses={detail.expenses}
      budgets={detail.budgets}
      currency={detail.homeCurrency}
      currentUserId={me.data?.id}
      localCurrencyCode={trip?.localCurrencies?.[0]}
    />
  );

  return (
    <View style={styles.root}>
      {/* Floats over the scrolling content like the tab screens' `AppHeader` (iOS toolbar). */}
      <View
        style={[styles.header, { paddingTop: insets.top + 6 }]}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        {/* No nav title: the trip name already heads the card (TripDetailView.swift:766-800). */}
        <BackButton />
        <View style={styles.headerSpacer} />
        {access.isOffline ? null : (
          <View style={styles.headerActions}>
            <GlassIconButton
              label={t('Invite')}
              onPress={() =>
                router.push({
                  pathname: '/trip/[tripId]/invite',
                  params: { tripId: String(tripId) },
                })
              }
              testID="trip-invite-button"
            >
              <SFSymbol
                name="person.badge.plus"
                fallback="person-add-outline"
                size={16}
                frame={22}
                weight="600"
                color={colors.contentB}
              />
            </GlassIconButton>
            {/* Creator/member actions: currency, dates, start/end, delete, leave — a native
                menu like SwiftUI's `Menu` (TripDetailView.swift:766-918). */}
            <TripMenuController
              currentUserId={me.data?.id}
              onLeave={() =>
                hasVault ? vaultLeaveSheetRef.current?.present() : leaveSheetRef.current?.present()
              }
              testID="trip-menu-button"
            >
              <GlassIconCircle>
                <SFSymbol
                  name="ellipsis"
                  fallback="ellipsis-horizontal"
                  size={16}
                  frame={22}
                  weight="600"
                  color={colors.contentB}
                />
              </GlassIconCircle>
            </TripMenuController>
          </View>
        )}
      </View>

      {detail.isLoading ? (
        <Spinner fill style={{ paddingTop: headerHeight }} />
      ) : (
        <FlashList
          data={rows}
          renderItem={({ item }) =>
            item.type === 'tab' ? (
              <View style={[styles.tabRow, { minHeight: tabMinHeight }]}>{tabBody}</View>
            ) : (
              <HistoryListRow
                row={item}
                uses24hourClock={uses24hourClock}
                onExpensePress={openExpense}
                onBudgetPress={openBudgets}
                expensePressDisabled={access.isOffline}
                style={styles.historyRow}
              />
            )
          }
          keyExtractor={(row) => row.key}
          getItemType={(row) => row.type}
          ListHeaderComponent={
            <View
              style={styles.listHeader}
              onLayout={(e) => setListHeaderHeight(e.nativeEvent.layout.height)}
            >
              {detail.servingCached ? <OfflineBanner cachedAt={detail.cachedAt} /> : null}
              {hasVaultCard ? (
                <TripVaultSection
                  tripId={tripId}
                  tripName={trip?.name ?? ''}
                  coverImageUrl={trip?.coverImageUrl}
                  balanceInHomeCurrency={vaultBalanceInHome}
                  homeCurrency={detail.homeCurrency}
                  isWaitingForEndApproval={endConsensus.isPending}
                  onWaitingForApproval={endConsensus.open}
                  onLeaveDepositCompleted={() =>
                    announceLeave.mutate(undefined, {
                      onSuccess: () => vaultLeaveSheetRef.current?.present(),
                      onError: (err) =>
                        Alert.alert(mutationErrorMessage(err, t('Something went wrong'))),
                    })
                  }
                />
              ) : (
                <HomeCard
                  budgets={detail.budgets}
                  expenses={detail.expenses}
                  currency={detail.homeCurrency.code as CurrencyCode}
                  localCurrency={trip?.localCurrencies?.[0]}
                  canEdit={access.canEdit}
                  coverImageUrl={trip?.coverImageUrl}
                  tripName={trip?.name ?? ''}
                  onRename={handleRename}
                  onPickCover={() => void handlePickCover()}
                  coverUploading={coverUploading}
                  onNewExpense={() =>
                    router.push({
                      pathname: '/trip/[tripId]/expense/new',
                      params: { tripId: String(tripId) },
                    })
                  }
                  onAddBudget={() =>
                    router.push({
                      pathname: '/trip/[tripId]/budget/new',
                      params: { tripId: String(tripId) },
                    })
                  }
                />
              )}
              <TripTabBar active={tab} onChange={handleTabChange} enabled={access.tabBarEnabled} />
            </View>
          }
          contentContainerStyle={{ paddingTop: contentTop, paddingBottom: contentBottom }}
          scrollIndicatorInsets={{ top: headerHeight }}
          onLayout={(e) => setListHeight(e.nativeEvent.layout.height)}
          // Plain-ScrollView parity: a new day section landing on top shows up in place instead
          // of the list shifting to keep the previously first row still.
          maintainVisibleContentPosition={{ disabled: true }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              progressViewOffset={headerHeight}
            />
          }
        />
      )}

      <LeaveTripSheet
        ref={leaveSheetRef}
        tripId={tripId}
        currentUserId={me.data?.id}
        currency={detail.homeCurrency}
      />

      {web3Enabled ? (
        <VaultLeaveSheet
          ref={vaultLeaveSheetRef}
          tripId={tripId}
          onRequestDeposit={(grossMicro) => requestVaultContribute(tripId, grossMicro)}
        />
      ) : null}

      <RearrangeDateSheet
        ref={rearrangeSheetRef}
        ctx={planDay.ctx}
        days={planDay.days}
        onRearrange={(order) => void dayOps.rearrange(planDay.ctx, order)}
        onDeleteDay={(day) => void dayOps.deleteDay(planDay.ctx, day)}
      />

      <AppSheet ref={inviteSheetRef} snapPoints={['60%', '92%']}>
        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.inviteSheet}
        >
          {trip?.inviteCode ? (
            <TripInviteCard
              tripName={trip.name}
              coverImageUrl={trip.coverImageUrl}
              inviteCode={trip.inviteCode}
            />
          ) : null}
        </BottomSheetScrollView>
      </AppSheet>
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
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerSpacer: { flex: 1 },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  // 10pt side insets; the tab bar sits 12 below the card and the tab body 12 below the bar.
  listHeader: { paddingHorizontal: 10, paddingBottom: 12, gap: 12 },
  historyRow: { marginHorizontal: 10 },
  tabRow: { paddingHorizontal: 10 },
  inviteSheet: { padding: spacing.lg },
});
