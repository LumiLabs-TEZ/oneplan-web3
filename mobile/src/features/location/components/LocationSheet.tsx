/**
 * Persistent bottom sheet for the location-detail screen — never closes, just swaps between two
 * contents (search / detail) and their own snap points. Unlike `AppSheet` (a dismissible
 * `BottomSheetModal`), this mirrors `DayMapSheet`'s persistent `BottomSheet` pattern. Port of
 * `ChooseLocationView`'s sheet content + `LocationDetailSummaryView`
 * (`ios/OnePlan/OnePlan/Component/BottomSheet/ChooseLocationView.swift`,
 * `ios/OnePlan/OnePlan/View/LocationDetailView.swift:360-560`).
 */
import {
  BoardAddSpotsButton,
  BoardLocationPicker,
} from '@/features/board/components/BoardLocationPicker';
import type { BoardPin, PinInput } from '@/features/board/types';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, {
  BottomSheetFooter,
  type BottomSheetFooterProps,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PlacePrediction } from '@/native/maps/placeSearch';
import { useAppLanguage } from '@/i18n';
import { SegmentedToggle } from '@/ui/components/SegmentedToggle';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import type { RecentLocationDto } from '../api/recentLocations';
import { LocationDetailContent, type LocationDetailPlace } from './LocationDetailContent';
import { PlaceSearchList } from './PlaceSearchList';

export type LocationSheetContent = 'search' | 'detail';

export interface LocationSheetProps {
  content: LocationSheetContent;
  mode: 'pick' | 'view';
  query: string;
  onQueryChange: (query: string) => void;
  results: readonly PlacePrediction[];
  recents: readonly RecentLocationDto[];
  suggested: readonly PlacePrediction[];
  showSuggested: boolean;
  onSelectResult: (place: PlacePrediction) => void;
  onSelectRecent: (recent: RecentLocationDto) => void;
  detailPlace: LocationDetailPlace | null;
  /** Formatted distance from the user for the detail summary strip. */
  distanceText: string | null;
  onAddToPlan: () => void;
  onIndexChange: (index: number) => void;
  /** Sheet top's y-position (px from screen top) — drives overlays that ride above the sheet. */
  animatedPosition?: SharedValue<number>;
  onBoardPick?: (pin: BoardPin) => void;
  onBoardBulk?: (pins: PinInput[]) => void;
}

/** Search rests just tall enough for tabs + search bar + one full "Recently viewed" card strip
 * (above the bottom safe area), then expands to 92%. */
const SEARCH_REST_HEIGHT = 400;
/** Detail peeks at 120 and rests hugging its content (measured); 40% until the first measure. */
const DETAIL_PEEK_HEIGHT = 120;
const DETAIL_FALLBACK_REST = '40%';
/** Handle row above the content: 10 + 5pt indicator + 10 (gorhom's default handle padding). */
const HANDLE_HEIGHT = 25;
/** Edge-attached like iOS `.large` — detaching a 92% sheet locks its scrollables (`AppSheet`). */
const SHEET_RADIUS = 38;

type SourceTab = 'newPlace' | 'myBoard';

export const LocationSheet = forwardRef<BottomSheet, LocationSheetProps>(function LocationSheet(
  {
    content,
    mode,
    query,
    onQueryChange,
    results,
    recents,
    suggested,
    showSuggested,
    onSelectResult,
    onSelectRecent,
    detailPlace,
    distanceText,
    onAddToPlan,
    onIndexChange,
    animatedPosition,
    onBoardPick,
    onBoardBulk,
  },
  ref,
) {
  useAppLanguage();
  const { t } = useTranslation();
  const [sourceTab, setSourceTab] = useState<SourceTab>('newPlace');
  const boardTab = sourceTab === 'myBoard';
  /** Open board in the "My Board" tab; iOS pushes it as its own page, so the tabs hide. */
  const [boardId, setBoardId] = useState(0);
  const [boardPins, setBoardPins] = useState<BoardPin[]>([]);
  const showAddSpots =
    content === 'search' && boardTab && boardId > 0 && boardPins.length > 0 && !!onBoardBulk;
  const sheetRef = useRef<BottomSheet>(null);

  // Switching content re-settles at that content's resting detent: search at its first snap
  // point, detail at its content-hugging rest — iOS sets `selectedDetent = detailDetent` on every morph to detail.
  const restingIndex = content === 'detail' ? 1 : 0;
  useEffect(() => {
    sheetRef.current?.snapToIndex(restingIndex);
  }, [restingIndex]);

  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();
  const searchSnapPoints = useMemo(() => [SEARCH_REST_HEIGHT + bottomInset, '92%'], [bottomInset]);
  const [detailContentHeight, setDetailContentHeight] = useState<number | null>(null);
  const detailSnapPoints = useMemo(
    () => [
      DETAIL_PEEK_HEIGHT,
      detailContentHeight !== null
        ? Math.max(DETAIL_PEEK_HEIGHT + 1, Math.round(detailContentHeight + HANDLE_HEIGHT))
        : DETAIL_FALLBACK_REST,
    ],
    [detailContentHeight],
  );
  const snapPoints = content === 'search' ? searchSnapPoints : detailSnapPoints;

  return (
    <BottomSheet
      ref={(instance) => {
        sheetRef.current = instance;
        if (typeof ref === 'function') ref(instance);
        else if (ref) ref.current = instance;
      }}
      index={restingIndex}
      snapPoints={snapPoints}
      // Fixed detents only — gorhom's default dynamic sizing inserts a content-height detent that
      // shifts the indices `restingIndex` relies on.
      enableDynamicSizing={false}
      enablePanDownToClose={false}
      onChange={onIndexChange}
      animatedPosition={animatedPosition}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      // Edge-to-edge Android never resizes the window for `adjustResize`, and in that mode gorhom
      // leaves the keyboard to the OS — the sheet stayed under it. `adjustPan` = gorhom lifts it.
      android_keyboardInputMode="adjustPan"
      // With the keyboard up, `interactive` lifts the sheet from its highest detent and clamps at the
      // container top — without an inset that is under the status bar / Dynamic Island.
      topInset={topInset}
      // Opaque over the map (a glass sheet let the dark map bleed through). The board drill-in is
      // iOS's Neutral50 page with white pin rows, so the whole sheet switches color with it.
      backgroundStyle={[
        styles.background,
        { backgroundColor: boardTab && boardId ? colors.neutral50 : colors.surface },
      ]}
      handleIndicatorStyle={styles.handle}
      footerComponent={
        showAddSpots
          ? (props: BottomSheetFooterProps) => (
              <BottomSheetFooter {...props}>
                <View style={[styles.footer, { paddingBottom: bottomInset + 8 }]}>
                  <BoardAddSpotsButton
                    count={boardPins.length}
                    onPress={() => onBoardBulk?.(boardPins)}
                  />
                </View>
              </BottomSheetFooter>
            )
          : undefined
      }
    >
      {content === 'search' ? (
        <View style={styles.searchRoot}>
          {onBoardPick && onBoardBulk && !(boardTab && boardId) ? (
            <SegmentedToggle
              variant="segmented"
              options={[
                { value: 'newPlace', label: t('New place') },
                { value: 'myBoard', label: t('My Board') },
              ]}
              value={sourceTab}
              onChange={setSourceTab}
              style={styles.tabs}
              testID="location-source-tabs"
            />
          ) : null}
          {boardTab && onBoardPick && onBoardBulk ? (
            <BoardLocationPicker
              boardId={boardId}
              onBoardChange={setBoardId}
              selectedPins={boardPins}
              onSelectedPinsChange={setBoardPins}
              onPick={onBoardPick}
            />
          ) : (
            <>
              <View style={styles.inputWrap}>
                <Ionicons name="search" size={16} color={colors.contentM} />
                <BottomSheetTextInput
                  style={styles.input}
                  placeholder={t('Search location')}
                  placeholderTextColor={colors.contentM}
                  value={query}
                  onChangeText={onQueryChange}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  testID="place-search"
                />
                {query.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('Clear search')}
                    hitSlop={8}
                    onPress={() => onQueryChange('')}
                    testID="place-search-clear"
                  >
                    <Ionicons name="close-circle" size={18} color={colors.contentM} />
                  </Pressable>
                ) : null}
              </View>
              <PlaceSearchList
                query={query}
                results={results}
                recents={recents}
                suggested={suggested}
                showSuggested={showSuggested}
                onSelectResult={onSelectResult}
                onSelectRecent={onSelectRecent}
              />
            </>
          )}
        </View>
      ) : detailPlace ? (
        <LocationDetailContent
          place={detailPlace}
          mode={mode}
          distanceText={distanceText}
          onAddToPlan={onAddToPlan}
          onContentHeight={setDetailContentHeight}
        />
      ) : null}
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  background: { borderRadius: SHEET_RADIUS, boxShadow: '0px -2px 12px rgba(0, 0, 0, 0.08)' },
  handle: { backgroundColor: colors.contentL, width: 36, height: 5 },
  // `ChooseLocationPickerContent`: 16pt top padding, 12pt horizontal insets on tabs + search.
  searchRoot: { flex: 1, paddingTop: 10 },
  tabs: { marginHorizontal: 12, marginTop: 6 },
  // `SearchBar.swift`: Neutral100 capsule, 49pt tall, 16pt padding, 14pt text.
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 49,
    paddingHorizontal: 16,
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 999,
    backgroundColor: colors.neutral100,
  },
  // iOS `safeAreaInset(edge: .bottom)`: 12pt sides, 8pt above the home indicator.
  footer: { paddingHorizontal: 12 },
  input: { flex: 1, ...beVietnamPro(14), color: colors.contentB, paddingVertical: 0 },
});
