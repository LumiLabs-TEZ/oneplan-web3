/**
 * Ended trips — port of `ios/OnePlan/OnePlan/View/Trip/EndedTripView.swift` as pushed from
 * `MainView.swift` (`navigateToEndedTrips`): bare glass back chevron on white, "Ended" label +
 * the same 2-column tilted grid. iOS has no empty state — the label shows over an empty grid.
 * Rows open the trip-end recap (`mode: 'ended'`, M3.5).
 */
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { PlanningDestinationCard } from '@/features/home/components';
import { useTrips } from '@/features/trip/api/queries';
import { partitionTrips } from '@/features/trip/helpers/partitionTrips';
import { useAppLanguage } from '@/i18n';
import { ScreenContainer, SectionHeader, Spinner } from '@/ui/components';
import { BackButton } from '@/ui/components/BackButton';
import { colors, spacing } from '@/ui/theme';

import { PLANNING_TILT_DEG } from '../(tabs)/trip';

export default function EndedTripsScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const trips = useTrips();
  const { ended } = partitionTrips(trips.data ?? []);

  return (
    <ScreenContainer style={styles.root}>
      <View style={styles.header}>
        <BackButton />
      </View>
      {trips.isPending && !trips.data ? (
        <Spinner fill />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <SectionHeader title={t('Ended')} />
          <View style={styles.grid}>
            {ended.map((item, i) => (
              <View key={item.id} style={styles.cell}>
                <PlanningDestinationCard
                  trip={item}
                  rotate={i % 2 === 0 ? -PLANNING_TILT_DEG : PLANNING_TILT_DEG}
                  onPress={() =>
                    router.push({
                      pathname: '/trip/[tripId]/end',
                      params: { tripId: String(item.id), mode: 'ended' },
                    })
                  }
                />
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.white },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, alignItems: 'flex-start' },
  // iOS: `.padding(.horizontal, 16).padding(.top, 12)`, VStack spacing 8.
  content: { paddingHorizontal: spacing.lg, paddingTop: 12, paddingBottom: 40, gap: 8 },
  // `LazyVGrid` parity: two exact half-width columns, 16pt gutter, 10pt row spacing — a lone
  // last card stays one column wide instead of stretching across the row.
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, marginHorizontal: -8 },
  cell: { width: '50%', paddingHorizontal: 8 },
});
