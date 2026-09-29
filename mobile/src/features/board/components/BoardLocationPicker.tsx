import { BottomSheetFlatList, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/i18n';
import { BackButton } from '@/ui/components/BackButton';
import { GlassSurface } from '@/ui/components/GlassSurface';
import { svg } from '@/ui/assets';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import { useBoards, useBoard } from '../api/queries';
import { BoardRow } from './BoardRow';
import { PinRow } from './PinRow';
import { BoardButton, styles, QueryError } from './common';
import type { BoardPin } from '../types';
export function BoardLocationPicker({
  boardId,
  onBoardChange,
  selectedPins,
  onSelectedPinsChange,
}: {
  /** Open board (0 = the Saved Boards list). Controlled so the host can hide its source tabs. */
  boardId: number;
  onBoardChange: (boardId: number) => void;
  /** Controlled so the host can render `BoardAddSpotsButton` in its sheet footer. */
  selectedPins: readonly BoardPin[];
  onSelectedPinsChange: (pins: BoardPin[]) => void;
  onPick: (pin: BoardPin) => void;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const boards = useBoards();
  const detail = useBoard(boardId);
  const [query, setQuery] = useState('');
  const pins = detail.data?.pins ?? [];
  const selected = selectedPins.map((pin) => pin.id);
  const allSelected = pins.length > 0 && selected.length === pins.length;
  const openBoard = (id: number) => {
    onSelectedPinsChange([]);
    setQuery('');
    onBoardChange(id);
  };
  if (!boardId)
    return (
      <BottomSheetFlatList
        showsVerticalScrollIndicator={false}
        data={boards.data ?? []}
        // `ChooseLocationPickerContent.savedBoardsContent`: 12 sides, 16 top, 24 bottom, 8 spacing.
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 16, paddingBottom: 24, gap: 8 }}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            <Text style={{ ...beVietnamPro(16, 'medium'), color: colors.contentM }}>
              {t('Saved Boards')}
            </Text>
            {boards.isError ? <QueryError onRetry={() => void boards.refetch()} /> : null}
          </View>
        }
        ListEmptyComponent={
          boards.isPending ? (
            <View style={{ minHeight: 200, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={colors.contentM} />
            </View>
          ) : boards.isError ? null : (
            <SavedBoardsEmpty label={t("You haven't created any boards yet.")} />
          )
        }
        renderItem={({ item }) => (
          <BoardRow variant="picker" board={item} onPress={() => openBoard(item.id)} />
        )}
      />
    );
  // `ChooseLocationBoardPinsView`: a pushed page (source tabs hidden) — glass back + "Select all"
  // capsule in the nav bar, the Find spot row scrolling with the pins, "Add N spots" in the bottom inset.
  return (
    <View style={s.page}>
      <View style={s.nav}>
        <BackButton onPress={() => openBoard(0)} testID="board-pins-back" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(allSelected ? 'Deselect all spots' : 'Select all spots')}
          accessibilityState={{ disabled: !pins.length }}
          disabled={!pins.length}
          hitSlop={6}
          onPress={() => onSelectedPinsChange(allSelected ? [] : pins)}
          style={[s.capsuleShadow, !pins.length && { opacity: 0.45 }]}
          testID="board-select-all"
        >
          <GlassSurface preset="control" radius={999} style={s.capsule}>
            <Text style={s.capsuleText}>{t(allSelected ? 'Deselect all' : 'Select all')}</Text>
          </GlassSurface>
        </Pressable>
      </View>
      <BottomSheetFlatList
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        data={pins.filter((pin) =>
          `${pin.name} ${pin.address ?? ''}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase()),
        )}
        contentContainerStyle={[s.list, selected.length > 0 && { paddingBottom: 24 + ADD_BAR }]}
        keyExtractor={(pin) => String(pin.id)}
        ListHeaderComponent={
          <View style={s.header}>
            <View style={s.findSpot}>
              <Ionicons name="search" size={18} color={colors.contentB} />
              <BottomSheetTextInput
                testID="board-find-spot"
                placeholder={t('Find spot')}
                placeholderTextColor={colors.contentL}
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
                style={s.findSpotInput}
              />
            </View>
            {detail.isError ? <QueryError onRetry={() => void detail.refetch()} /> : null}
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.muted}>{t(detail.isPending ? 'Loading...' : 'No Pins')}</Text>
        }
        renderItem={({ item }) => (
          <PinRow
            pin={item}
            selected={selected.includes(item.id)}
            onPress={() =>
              onSelectedPinsChange(
                selected.includes(item.id)
                  ? selectedPins.filter((pin) => pin.id !== item.id)
                  : [...selectedPins, item],
              )
            }
          />
        )}
      />
    </View>
  );
}

/**
 * "Add N spots" for the host sheet's footer — iOS keeps it in the drill-in's bottom safe-area
 * inset. A gorhom footer tracks the visible sheet bottom; content anchored to the bottom would sit
 * off-screen at the resting detent (the content is sized to the tallest detent).
 */
export function BoardAddSpotsButton({ count, onPress }: { count: number; onPress: () => void }) {
  useAppLanguage();
  const { t } = useTranslation();
  return (
    <Animated.View entering={FadeInDown.duration(280)} exiting={FadeOutDown.duration(280)}>
      <BoardButton
        title={t('Add %lld spots', { 0: count, count })}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
          onPress();
        }}
        testID="board-add-spots"
      />
    </Animated.View>
  );
}

/** Room the "Add N spots" footer takes over the end of the list. */
const ADD_BAR = 64;

const s = StyleSheet.create({
  // No Neutral50 fill: an opaque page under the glass sheet's rounded top leaves a hard edge.
  page: { flex: 1 },
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  capsuleShadow: { borderRadius: 999, boxShadow: '0px 2px 6px rgba(0,0,0,0.10)' },
  capsule: { height: 34, paddingHorizontal: 14, justifyContent: 'center' },
  capsuleText: { ...beVietnamPro(15, 'medium'), color: colors.contentB },
  list: { paddingHorizontal: 12, paddingTop: 16, paddingBottom: 24, gap: 6 },
  // 4 + the list's 6pt gap = iOS's 10pt between the search row and the pins.
  header: { gap: 10, marginBottom: 4 },
  findSpot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: colors.white,
  },
  findSpotInput: { flex: 1, ...beVietnamPro(15), color: colors.contentB, paddingVertical: 0 },
});

/** Swift's empty board list: 160pt `emptyHome` + 14pt ContentM label, centered, min 300 tall. */
function SavedBoardsEmpty({ label }: { label: string }) {
  const EmptyHome = svg.illustration.emptyHome;
  return (
    <View style={{ minHeight: 300, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <EmptyHome width={160} height={160 * (220 / 186)} />
      <Text style={{ ...beVietnamPro(14), color: colors.contentM }}>{label}</Text>
    </View>
  );
}
