/**
 * Persistent stop-list sheet for the full-screen day map — port of
 * `PlanDayStopListSheet` (`ios/OnePlan/OnePlan/View/Plan/PlanDayMapView.swift:268-437`).
 * Unlike `AppSheet` (a dismissible `BottomSheetModal`), this is a persistent
 * `BottomSheet` that never closes — it only toggles between a mini bar and an
 * expanded stop list driven by `DayMapState.sheet`. Both float inset from the
 * screen edges like the iOS 26 partial-height sheet, with the iOS
 * `.presentationCornerRadius(24)`. The iOS detents (80 / 300) are measured from
 * the screen bottom, so the card itself is the detent minus the floating gap.
 */
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, {
  BottomSheetFlatList,
  type BottomSheetFlatListMethods,
} from '@gorhom/bottom-sheet';
import { forwardRef, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import type { DayMapSheetRow, DayMapState, FocusedLeg } from '../helpers/dayMapSelection';
import type { DayPin } from '../helpers/planDays';

export interface DayMapSheetProps {
  title: string;
  subtitle: string;
  rows: readonly DayMapSheetRow[];
  state: DayMapState;
  /** Selected leg (A → B) for the collapsed bar — `focusedLeg` in `dayMapSelection`. */
  focusedLeg: FocusedLeg | null;
  /** Fired when a stop row (or its pin) is tapped — the caller runs `togglePin`. */
  onRowPress: (pinId: number) => void;
  /** Fired when the mini bar or the expanded header is tapped — expand or deselect. */
  onHeaderPress: () => void;
}

/** Gap between the floating card and the screen's bottom / side edges. */
const FLOATING_BOTTOM_GAP = 20;
const FLOATING_SIDE_GAP = 16;
const MINI_HEIGHT = 80 - FLOATING_BOTTOM_GAP;
const EXPANDED_HEIGHT = 300 - FLOATING_BOTTOM_GAP;
const CORNER_RADIUS = 24;
const SNAP_POINTS = [MINI_HEIGHT, EXPANDED_HEIGHT];

function focusedPin(rows: readonly DayMapSheetRow[], selectedPinId: number | null): DayPin | null {
  if (selectedPinId == null) return null;
  for (const row of rows) {
    if (row.kind === 'stop' && row.pin.id === selectedPinId) return row.pin;
  }
  return null;
}

export const DayMapSheet = forwardRef<BottomSheet, DayMapSheetProps>(function DayMapSheet(
  { title, subtitle, rows, state, focusedLeg, onRowPress, onHeaderPress },
  ref,
) {
  const sheetRef = useRef<BottomSheet>(null);
  const listRef = useRef<BottomSheetFlatListMethods>(null);

  useEffect(() => {
    sheetRef.current?.snapToIndex(state.sheet === 'mini' ? 0 : 1);
  }, [state.sheet]);

  useEffect(() => {
    if (state.sheet !== 'expanded' || state.selectedPinId == null) return;
    const index = rows.findIndex(
      (row) => row.kind === 'stop' && row.pin.id === state.selectedPinId,
    );
    if (index >= 0) {
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
    }
  }, [state.sheet, state.selectedPinId, rows]);

  const focused = focusedPin(rows, state.selectedPinId);

  return (
    <BottomSheet
      ref={(instance) => {
        sheetRef.current = instance;
        if (typeof ref === 'function') ref(instance);
        else if (ref) ref.current = instance;
      }}
      index={1}
      snapPoints={SNAP_POINTS}
      // v5 defaults this on, which adds a content-height snap point — the stop list would
      // grow the sheet far past the 300pt iOS detent. The list scrolls inside it instead.
      enableDynamicSizing={false}
      enablePanDownToClose={false}
      detached
      bottomInset={FLOATING_BOTTOM_GAP}
      style={styles.floating}
      backgroundStyle={styles.background}
      handleComponent={null}
    >
      <View style={styles.root} testID="day-map-sheet">
        {state.sheet === 'mini' ? (
          <Pressable accessibilityRole="button" onPress={onHeaderPress} style={styles.miniBar}>
            {focusedLeg ? (
              <>
                <View style={styles.miniLegStops}>
                  {[focusedLeg.from, focusedLeg.to].map((stop) => (
                    <View key={stop.id} style={styles.miniLegStop}>
                      <View style={[styles.glyph, styles.glyphSmall]}>
                        <Text style={[styles.glyphText, styles.glyphTextSmall]}>{stop.index}</Text>
                      </View>
                      <Text style={[styles.rowTitle, styles.miniLegTitle]} numberOfLines={1}>
                        {stop.title}
                      </Text>
                    </View>
                  ))}
                </View>
                {focusedLeg.duration ? (
                  <View style={styles.miniLegInfo}>
                    <View style={styles.modeRow}>
                      <Ionicons
                        name={focusedLeg.mode === 'walk' ? 'walk' : 'car'}
                        size={13}
                        color={colors.contentM}
                      />
                      <Text style={styles.rowTime}>{focusedLeg.duration}</Text>
                    </View>
                    <Text style={styles.rowTime}>{focusedLeg.distance}</Text>
                  </View>
                ) : null}
              </>
            ) : focused ? (
              <>
                <View style={styles.glyph}>
                  <Text style={styles.glyphText}>{focused.index}</Text>
                </View>
                <View style={styles.miniText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {focused.title}
                  </Text>
                  {focused.subtitle ? (
                    <Text style={styles.rowSubtitle} numberOfLines={1}>
                      {focused.subtitle}
                    </Text>
                  ) : null}
                </View>
              </>
            ) : (
              <View style={styles.miniText}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={styles.rowSubtitle}>{subtitle}</Text>
              </View>
            )}
            <Ionicons name="chevron-up" size={14} color={colors.contentM} />
          </Pressable>
        ) : (
          <View style={styles.expanded}>
            <Pressable accessibilityRole="button" onPress={onHeaderPress} style={styles.header}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.headerSubtitle}>{subtitle}</Text>
            </Pressable>
            <BottomSheetFlatList
              showsVerticalScrollIndicator={false}
              ref={listRef}
              data={rows as DayMapSheetRow[]}
              keyExtractor={(row) =>
                row.kind === 'stop' ? `stop-${row.pin.id}` : `leg-${row.index}`
              }
              onScrollToIndexFailed={() => {}}
              contentContainerStyle={styles.listContent}
              renderItem={({ item: row, index }) =>
                row.kind === 'stop' ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onRowPress(row.pin.id)}
                    style={[
                      styles.stopRow,
                      state.selectedPinId === row.pin.id && styles.stopRowSelected,
                    ]}
                    testID={`day-map-row-${index}`}
                  >
                    <View style={styles.glyph}>
                      <Text style={styles.glyphText}>{row.pin.index}</Text>
                    </View>
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {row.pin.title}
                      </Text>
                      {row.pin.subtitle ? (
                        <Text style={styles.rowSubtitle} numberOfLines={1}>
                          {row.pin.subtitle}
                        </Text>
                      ) : null}
                    </View>
                    {row.pin.timeLabel ? (
                      <Text style={styles.rowTime}>{row.pin.timeLabel}</Text>
                    ) : null}
                  </Pressable>
                ) : (
                  <View style={styles.legRow} testID={`day-map-row-${index}`}>
                    <View style={styles.legRule} />
                    <Ionicons
                      name={row.mode === 'walk' ? 'walk' : 'car'}
                      size={12}
                      color={colors.contentM}
                    />
                    <Text style={styles.legLabel}>{row.label}</Text>
                  </View>
                )
              }
            />
          </View>
        )}
      </View>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  background: {
    backgroundColor: colors.surface,
    borderRadius: CORNER_RADIUS,
    boxShadow: '0px 4px 16px rgba(0,0,0,0.12)',
  },
  floating: { marginHorizontal: FLOATING_SIDE_GAP },
  root: { flex: 1 },
  // Fixed height, not `flex: 1`: the sheet's content is laid out at the expanded
  // height, so a flexed bar would center its row below the visible mini card.
  miniBar: {
    height: MINI_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  miniText: { flex: 1, gap: 2 },
  miniLegStops: { flex: 1, gap: 4 },
  miniLegStop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniLegTitle: { flex: 1, fontSize: 14 },
  miniLegInfo: { alignItems: 'flex-end', gap: 2 },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  // Clip the scrolling list to the floating card — otherwise rows scrolled past the card's
  // rounded bottom edge keep drawing over the map below it.
  expanded: { height: EXPANDED_HEIGHT, borderRadius: CORNER_RADIUS, overflow: 'hidden' },
  header: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10, gap: 2 },
  headerTitle: { ...beVietnamPro(16, 'semibold'), color: colors.contentB },
  headerSubtitle: { ...beVietnamPro(13), color: colors.contentM },
  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
  },
  stopRowSelected: { backgroundColor: colors.blueAlpha10 },
  glyph: {
    width: 29,
    height: 29,
    borderRadius: 14.5,
    backgroundColor: colors.blueBase,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphText: { ...beVietnamPro(14, 'semibold'), color: colors.white },
  glyphSmall: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5 },
  glyphTextSmall: { fontSize: 11 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...beVietnamPro(15, 'medium'), color: colors.contentB },
  rowSubtitle: { ...beVietnamPro(13), color: colors.contentM },
  rowTime: { ...beVietnamPro(13, 'medium'), color: colors.contentM },
  legRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  legRule: { width: 1, height: 18, marginLeft: 24, backgroundColor: colors.contentL, opacity: 0.4 },
  legLabel: { ...beVietnamPro(12), color: colors.contentM },
});
