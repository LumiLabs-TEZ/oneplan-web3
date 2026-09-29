/**
 * Trip tab — port of `ios/OnePlan/OnePlan/View/Trip/TripView.swift`: empty state
 * (`EmptyHome` online / `EmptyOffline` offline), "Ongoing Trip" card, then a 2-column
 * "Planning" grid of `PlanningDestinationCard`s with alternating ±1.2° rotation.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import {
  EmptyHome,
  EmptyOffline,
  OngoingCard,
  PlanningDestinationCard,
} from '@/features/home/components';
import { useTrip, useTrips } from '@/features/trip/api/queries';
import { useTabContentInsets } from '@/features/shell/useTabContentInsets';
import { partitionTrips } from '@/features/trip/helpers/partitionTrips';
import { useAppLanguage } from '@/i18n';
import { isServingCached, useIsOnline } from '@/offline/servingCached';
import { OfflineBanner, SectionHeader, Spinner } from '@/ui/components';
import { spacing } from '@/ui/theme';

export const PLANNING_TILT_DEG = 1.2;

export default function TripTab() {
  useAppLanguage();
  const { t } = useTranslation();
  const online = useIsOnline();
  const trips = useTrips();
  const { ongoing, planning } = partitionTrips(trips.data ?? []);
  const trip = useTrip(ongoing?.id ?? null, { persist: true });
  const [refreshing, setRefreshing] = useState(false);
  const servingCached = isServingCached(trips, online);
  const insets = useTabContentInsets();

  const openTrip = (tripId: number) =>
    router.push({ pathname: '/trip/[tripId]', params: { tripId: String(tripId) } });
  const createTrip = () => router.push('/trip/new');

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([trips.refetch(), trip.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  if (trips.isPending && !trips.data) return <Spinner fill style={insets.contentStyle} />;
  if (!ongoing && planning.length === 0) {
    return (
      // Vertically centred like TripView's Spacer/EmptyHome/Spacer VStack.
      <View style={[styles.empty, insets.contentStyle]}>
        {online ? (
          <EmptyHome onStartNewTrip={createTrip} />
        ) : (
          <EmptyOffline onRetry={() => void trips.refetch()} />
        )}
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.content, insets.contentStyle]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {servingCached ? <OfflineBanner cachedAt={trips.dataUpdatedAt || null} /> : null}
      {ongoing ? (
        <View style={styles.section}>
          <SectionHeader title={t('Ongoing Trip')} />
          <OngoingCard
            trip={trip.data ?? ongoing}
            onPress={() => openTrip(ongoing.id)}
            onNewExpense={() =>
              router.push({
                pathname: '/trip/[tripId]/expense/new',
                params: { tripId: String(ongoing.id) },
              })
            }
          />
        </View>
      ) : null}
      {planning.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title={t('Planning')} />
          <View style={styles.grid}>
            {planning.map((item, i) => (
              <View key={item.id} style={styles.cell}>
                <PlanningDestinationCard
                  trip={item}
                  rotate={i % 2 === 0 ? -PLANNING_TILT_DEG : PLANNING_TILT_DEG}
                  onPress={() => openTrip(item.id)}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, justifyContent: 'center' },
  content: { gap: spacing.lg },
  section: { gap: spacing.md },
  // Two exact half-width columns with a 16pt gutter (LazyVGrid parity) — a lone last
  // card stays one column wide instead of stretching across the row.
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 22, marginHorizontal: -8 },
  cell: { width: '50%', paddingHorizontal: 8 },
});
