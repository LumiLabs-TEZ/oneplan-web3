/**
 * Search bar + result list of `TripLocationPickerSheet.swift`, shared by the create-trip location
 * route (`src/app/trip/new/location.tsx`) and `LocationSearchSheet` (Request a plan). `inSheet`
 * swaps in the gorhom input/list so keyboard handling and scrolling work inside a bottom sheet.
 */
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetFlatList, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { components } from '@/api/schema';
import { useLocationSearch, useSuggestedCities } from '@/features/location/api/queries';
import { locationSubtitle, locationTitle } from '@/features/location/helpers/locationLabel';
import { classifyQueryError } from '@/features/trip/api/queries';
import { useAppLanguage } from '@/i18n';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { EmptyState, Spinner } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

type LocationSearchResultDto = components['schemas']['LocationSearchResultDto'];

function LocationRow({
  result,
  onPress,
  testID,
}: {
  result: LocationSearchResultDto;
  onPress: () => void;
  /** Row index identifier — without it RN flattens the row out of the a11y tree entirely,
      which makes the result list unreachable from XCUITest / Maestro. */
  testID: string;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress} testID={testID}>
      <View style={styles.emojiTile}>
        <Text style={styles.emoji}>{result.country.emoji ?? ''}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {locationTitle(result)}
        </Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {locationSubtitle(result)}
        </Text>
      </View>
    </Pressable>
  );
}

export function LocationSearchContent({
  onSelect,
  inSheet = false,
  autoFocus = true,
  showsScrollIndicator = true,
}: {
  onSelect: (result: LocationSearchResultDto) => void;
  inSheet?: boolean;
  autoFocus?: boolean;
  showsScrollIndicator?: boolean;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const trimmed = debouncedQuery.trim();

  const suggested = useSuggestedCities();
  const search = useLocationSearch(trimmed);

  const selectResult = (result: LocationSearchResultDto) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(result);
  };

  const active = trimmed.length === 0 ? suggested : search;
  const Input = inSheet ? BottomSheetTextInput : TextInput;
  const List = inSheet ? BottomSheetFlatList : FlatList;

  let body: ReactNode;
  if (trimmed.length > 0 && trimmed.length < 2) {
    body = <EmptyState title={t('Keep typing')} style={styles.fill} />;
  } else if (active.isPending) {
    body = <Spinner fill />;
  } else if (active.isError) {
    body = (
      <EmptyState
        title={classifyQueryError(active.error).message}
        action={{ label: t('Retry'), onPress: () => void active.refetch() }}
        style={styles.fill}
      />
    );
  } else if (!active.data || active.data.length === 0) {
    body = <EmptyState title={t('No locations found')} style={styles.fill} />;
  } else {
    body = (
      <List
        data={active.data}
        keyExtractor={(item: LocationSearchResultDto, index: number) =>
          `${item.city?.id ?? item.state.id}-${index}`
        }
        renderItem={({ item, index }: { item: LocationSearchResultDto; index: number }) => (
          <LocationRow
            result={item}
            onPress={() => selectResult(item)}
            testID={`location-result-${index}`}
          />
        )}
        style={styles.fill}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={showsScrollIndicator}
      />
    );
  }

  return (
    <>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={colors.contentB} />
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder={t('Search cities')}
          placeholderTextColor={colors.contentL}
          autoFocus={autoFocus}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.searchInput}
          testID="location-search-input"
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel={t('Clear search')}
            hitSlop={8}
            testID="location-search-clear"
          >
            <Ionicons name="close-circle" size={16} color={colors.contentM} />
          </Pressable>
        ) : null}
      </View>
      {body}
    </>
  );
}

const styles = StyleSheet.create({
  // `SearchBar.swift` defaults: Neutral100 capsule, 49pt tall, 16pt padding.
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: 12,
    marginTop: 12,
    paddingHorizontal: spacing.lg,
    height: 49,
    borderRadius: radius.pill,
    backgroundColor: colors.neutral100,
  },
  searchInput: { flex: 1, ...beVietnamPro(14), color: colors.contentB },
  list: { gap: 6, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  fill: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: spacing.sm,
  },
  emojiTile: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.neutral50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.2,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    boxShadow: '0px 5px 10px rgba(0, 0, 0, 0.12), 0px 1px 2px rgba(0, 0, 0, 0.04)',
  },
  emoji: { fontSize: 30 },
  rowText: { flex: 1, marginLeft: spacing.lg, gap: 3 },
  rowTitle: { ...beVietnamPro(18, 'semibold'), color: colors.black },
  rowSubtitle: { ...beVietnamPro(16, 'medium'), color: colors.contentM },
});
