/**
 * Home — port of `ios/OnePlan/OnePlan/View/HomeView.swift:70-236`.
 * Render branches mirror iOS exactly: first-load spinner only while trips are
 * loading and the whole Home is empty (never during a refresh of existing
 * content), offline with no ongoing trip → invitation banner + `EmptyOffline`,
 * otherwise the section stack in iOS order. There is deliberately no
 * "no trips, online" empty state — iOS `HomeView` just skips the Ongoing
 * section and renders the remaining sections (`EmptyHome` belongs to the Trip
 * tab, not Home).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { useBoards } from '@/features/board/api/queries';
import { EmptyOffline } from '@/features/home/components/EmptyOffline';
import { FriendRequestBanner } from '@/features/home/components/FriendRequestBanner';
import { InvitationBanner } from '@/features/home/components/InvitationBanner';
import { OngoingCard } from '@/features/home/components/OngoingCard';
import { PinExtractionBanner } from '@/features/home/components/PinExtractionBanner';
import { PopularPlansSection } from '@/features/home/components/PopularPlansSection';
import { QuickAccessSection } from '@/features/home/components/QuickAccessSection';
import { TodaysActivitiesCard } from '@/features/home/components/TodaysActivitiesCard';
import { YourBoardsSection } from '@/features/home/components/YourBoardsSection';
import { useTabContentInsets } from '@/features/shell/useTabContentInsets';
import { homeState } from '@/features/home/helpers/homeState';
import { useMarketFeed } from '@/features/market/api/queries';
import { usePlanItems, useTrip, useTrips } from '@/features/trip/api/queries';
import { partitionTrips } from '@/features/trip/helpers/partitionTrips';
import { localDateString, todaysActivities } from '@/features/trip/helpers/todaysActivities';
import { useAppLanguage } from '@/i18n';
import { isServingCached, useIsOnline } from '@/offline/servingCached';
import { OfflineBanner } from '@/ui/components/OfflineBanner';
import { SectionHeader } from '@/ui/components/SectionHeader';
import { Spinner } from '@/ui/components/Spinner';
import { spacing } from '@/ui/theme';

export default function HomeTab() {
  useAppLanguage();
  const { t } = useTranslation();
  const online = useIsOnline();
  const trips = useTrips();
  const { ongoing } = partitionTrips(trips.data ?? []);
  const ongoingId = ongoing?.id ?? null;
  const trip = useTrip(ongoingId, { persist: true });
  const planItems = usePlanItems(ongoingId, { persist: true });
  // Feed/boards are fetched here (not inside the sections) so the first-load
  // branch can require the whole Home to be empty, like `HomeView.swift:75-77`.
  const feed = useMarketFeed({ take: 20, tab: 'TRENDING' });
  const boardsQuery = useBoards();
  const [refreshing, setRefreshing] = useState(false);
  const insets = useTabContentInsets();

  const servingCached = isServingCached(trips, online);
  const pins = todaysActivities(planItems.data ?? []);
  // Admin-featured listings first; trending fallback keeps the section
  // populated when nothing is featured (`HomeView.swift:62-64`).
  const popularItems = feed.data?.featured.length ? feed.data.featured : (feed.data?.items ?? []);
  const boards = boardsQuery.data ?? [];

  const state = homeState({
    fetchingTrips: trips.isFetching,
    hasOngoing: ongoing !== null,
    popularCount: popularItems.length,
    boardCount: boards.length,
    online,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        trips.refetch(),
        // `refetch()` ignores `enabled: false` — without an ongoing trip these would hit `/trips/0`.
        ongoingId != null ? trip.refetch() : null,
        ongoingId != null ? planItems.refetch() : null,
        feed.refetch(),
        boardsQuery.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const openTrip = (tripId: number) =>
    router.push({ pathname: '/trip/[tripId]', params: { tripId: String(tripId) } });
  const newExpense = (tripId: number) =>
    router.push({ pathname: '/trip/[tripId]/expense/new', params: { tripId: String(tripId) } });
  const createTrip = () => router.push('/trip/new');

  if (state === 'loading') {
    return (
      <ScrollView
        contentContainerStyle={[styles.loadingContent, insets.contentStyle]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <InvitationBanner />
        <FriendRequestBanner />
        <Spinner style={styles.loadingSpinner} />
      </ScrollView>
    );
  }

  if (state === 'offline') {
    return (
      <View style={[styles.offline, insets.contentStyle]}>
        <InvitationBanner />
        <FriendRequestBanner />
        <View style={styles.offlineCenter}>
          <EmptyOffline />
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.content, insets.contentStyle]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <InvitationBanner />
      <FriendRequestBanner />
      {/* Slides the rest of Home up when the invitation banner animates out. */}
      <Animated.View layout={LinearTransition.duration(220)} style={styles.content}>
        {servingCached ? <OfflineBanner cachedAt={trips.dataUpdatedAt || null} /> : null}
        {ongoing ? (
          <View style={styles.section}>
            <SectionHeader title={t('Ongoing')} />
            <OngoingCard
              trip={trip.data ?? ongoing}
              onPress={() => openTrip(ongoing.id)}
              onNewExpense={() => newExpense(ongoing.id)}
            />
            <TodaysActivitiesCard
              pins={pins}
              tripId={ongoing.id}
              date={localDateString(new Date())}
            />
          </View>
        ) : null}
        <PinExtractionBanner />
        <QuickAccessSection
          onCreateTrip={createTrip}
          onMissions={() => router.push({ pathname: '/missions', params: { source: 'home' } })}
        />
        {popularItems.length > 0 ? (
          <PopularPlansSection
            items={popularItems}
            onItemTapped={(item) =>
              router.push({ pathname: '/market/listing/[id]', params: { id: item.id } })
            }
            onSeeAll={() => router.push('/(tabs)/market')}
          />
        ) : null}
        {boards.length > 0 ? (
          <YourBoardsSection boards={boards} onSeeAll={() => router.push('/(tabs)/board')} />
        ) : null}
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg },
  loadingContent: { gap: spacing.lg },
  loadingSpinner: { minHeight: 120 },
  offline: { flex: 1, gap: spacing.lg },
  offlineCenter: { flex: 1, justifyContent: 'center' },
  // iOS `ongoingSection` stacks header/card/activities at spacing 8 (HomeView.swift:239).
  section: { gap: spacing.sm },
});
