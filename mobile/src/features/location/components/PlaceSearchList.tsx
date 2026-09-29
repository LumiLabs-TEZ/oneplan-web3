/**
 * Search content body for `LocationSheet`: an empty query shows horizontal "Recently viewed" and
 * "Suggested for you" card strips (or an empty illustration when there's neither), a query under
 * 2 chars shows a "keep typing" hint, and a settled query shows result rows (or a "no locations
 * found" empty state). Port of `ChooseLocationPickerContent`'s `defaultContent` /
 * `searchResultsList` (`ChooseLocationView.swift`).
 */
import { BottomSheetFlatList, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { PlacePrediction } from '@/native/maps/placeSearch';
import { useAppLanguage } from '@/i18n';
import { svg } from '@/ui/assets';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import type { RecentLocationDto } from '../api/recentLocations';
import { LocationCardStrip, type LocationCardItem } from './LocationCardStrip';
import { PlaceSearchRow } from './PlaceSearchRow';

export interface PlaceSearchListProps {
  query: string;
  results: readonly PlacePrediction[];
  recents: readonly RecentLocationDto[];
  suggested: readonly PlacePrediction[];
  /** Only render the suggested strip once a user coordinate is available. */
  showSuggested: boolean;
  onSelectResult: (place: PlacePrediction) => void;
  onSelectRecent: (recent: RecentLocationDto) => void;
  testID?: string;
}

function recentCard(recent: RecentLocationDto): LocationCardItem {
  return {
    key: `recent-${recent.id}`,
    name: recent.name,
    address: recent.address ?? null,
    category: recent.pointOfInterestCategory ?? null,
  };
}

function suggestedCard(place: PlacePrediction): LocationCardItem {
  return { key: place.placeId, name: place.name, address: place.address, category: place.category };
}

function EmptyLabel({ text }: { text: string }) {
  return (
    <View style={styles.hintContainer}>
      <Text style={styles.hint}>{text}</Text>
    </View>
  );
}

export function PlaceSearchList({
  query,
  results,
  recents,
  suggested,
  showSuggested,
  onSelectResult,
  onSelectRecent,
  testID,
}: PlaceSearchListProps) {
  useAppLanguage();
  const { t } = useTranslation();

  const trimmed = query.trim();

  if (trimmed.length === 0) {
    const hasRecents = recents.length > 0;
    const hasSuggested = showSuggested && suggested.length > 0;
    const EmptyHome = svg.illustration.emptyHome;
    return (
      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        testID={testID}
        contentContainerStyle={styles.defaultContent}
      >
        {hasRecents ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>{t('Recently viewed')}</Text>
            <LocationCardStrip
              items={recents.map(recentCard)}
              onSelect={(index) => onSelectRecent(recents[index]!)}
              cardTestIDPrefix="recent-row"
              testID="recent-strip"
            />
          </View>
        ) : null}
        {hasSuggested ? (
          <View style={styles.section}>
            <Text style={styles.sectionHeader}>{t('Suggested for you')}</Text>
            <LocationCardStrip
              items={suggested.map(suggestedCard)}
              onSelect={(index) => onSelectResult(suggested[index]!)}
              cardTestIDPrefix="suggested-strip-card"
              testID="suggested-strip"
            />
          </View>
        ) : null}
        {!hasRecents && !hasSuggested ? (
          <View style={styles.emptyState}>
            <EmptyHome width={200} height={200 * (220 / 186)} />
            <Text style={styles.hint}>{t('Search for a place to get started')}</Text>
          </View>
        ) : null}
      </BottomSheetScrollView>
    );
  }

  if (trimmed.length < 2) {
    return <EmptyLabel text={t('Keep typing')} />;
  }

  return (
    <BottomSheetFlatList
      showsVerticalScrollIndicator={false}
      data={results as PlacePrediction[]}
      keyExtractor={(item) => item.placeId}
      keyboardShouldPersistTaps="handled"
      testID={testID}
      renderItem={({ item, index }) => (
        <PlaceSearchRow
          place={item}
          onPress={() => onSelectResult(item)}
          testID={`place-row-${index}`}
        />
      )}
      ListEmptyComponent={<EmptyLabel text={t('No locations found')} />}
      contentContainerStyle={styles.results}
    />
  );
}

const styles = StyleSheet.create({
  defaultContent: { gap: 18, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 20 },
  section: { gap: 8 },
  sectionHeader: { ...beVietnamPro(14), color: colors.contentM },
  emptyState: { alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: 300 },
  results: { paddingTop: 8, paddingBottom: spacing.xxl },
  hintContainer: { paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, alignItems: 'center' },
  hint: { ...beVietnamPro(14), color: colors.contentM },
});
