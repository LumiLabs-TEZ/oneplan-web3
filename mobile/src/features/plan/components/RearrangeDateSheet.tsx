/**
 * Rearrange-days bottom sheet — drag a row's handle to reorder days, or tap "Delete" to erase a
 * whole day's plans. Port of `RearrangeDateBottomSheet`
 * (`ios/OnePlan/OnePlan/Component/BottomSheet/RearrangeDateBottomSheet.swift`).
 *
 * Rows stay in their original `days` order in the tree (stable testIDs, easy to assert on in
 * tests); visual position is driven entirely by an `order` shared value (the current visual
 * arrangement of day numbers, from `helpers/reorder.ts`'s `moveItem`/`indexForOffset`) so a drag
 * never actually reorders the DOM — only the `translateY` transform. The dragged row tracks the
 * finger 1:1 (clamped to the list); every other row's transform is `withTiming`-animated to its
 * new slot the instant the drag crosses its midpoint (mirrors iOS's `withAnimation(.spring(...))`
 * on `arrangedItems.move`).
 */
import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useMemo } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useAppLanguage } from '@/i18n';
import { AppSheet, type AppSheetRef } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { dayChipLabel, type DayContext } from '../helpers/planDays';
import { indexForOffset, moveItem } from '../helpers/reorder';

const ROW_HEIGHT = 56;
const ROW_GAP = 8;
const PITCH = ROW_HEIGHT + ROW_GAP;
const SHEET_HEIGHT = 560;

export type RearrangeDateSheetRef = AppSheetRef;

export interface RearrangeDateSheetProps {
  ctx: DayContext;
  days: readonly number[];
  onRearrange: (orderedDays: number[]) => void;
  onDeleteDay: (day: number) => void;
}

export const RearrangeDateSheet = forwardRef<RearrangeDateSheetRef, RearrangeDateSheetProps>(
  function RearrangeDateSheet({ ctx, days, onRearrange, onDeleteDay }, ref) {
    const locale = useAppLanguage();
    const { t } = useTranslation();

    const rowTitle = (day: number): string => {
      const { dateLabel, dayNumber } = dayChipLabel(ctx, day, locale);
      const dayLabel = t('Day %lld', { 0: dayNumber });
      return dateLabel ? `${dateLabel} · ${dayLabel}` : dayLabel;
    };

    const confirmDelete = (day: number) => {
      if (days.length <= 1) return;
      Alert.alert(
        t('Delete every plan in %@?', { 0: rowTitle(day) }),
        t('This will delete every plan in this day.'),
        [
          { text: t('Cancel'), style: 'cancel' },
          { text: t('Delete'), style: 'destructive', onPress: () => onDeleteDay(day) },
        ],
      );
    };

    return (
      <AppSheet
        ref={ref}
        snapPoints={[SHEET_HEIGHT]}
        backgroundRadius={radius.xxl}
        // A row drag must not also pan the sheet; the grabber still drags it.
        enableContentPanningGesture={false}
      >
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {t('Re-arrange your trip')}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {t('Drag to arrange or tap “Delete” to erase plan')}
          </Text>
        </View>

        <RearrangeRowList
          days={days}
          rowTitle={rowTitle}
          onRearrange={onRearrange}
          onDeletePress={confirmDelete}
          t={t}
        />
      </AppSheet>
    );
  },
);

interface RearrangeRowListProps {
  days: readonly number[];
  rowTitle: (day: number) => string;
  onRearrange: (orderedDays: number[]) => void;
  onDeletePress: (day: number) => void;
  t: TFunction;
}

function RearrangeRowList({
  days,
  rowTitle,
  onRearrange,
  onDeletePress,
  t,
}: RearrangeRowListProps) {
  const count = days.length;
  const deleteDisabled = count <= 1;

  // Current visual arrangement of day numbers. Reset whenever the row set changes (a day was
  // added/deleted elsewhere while the sheet was open, or on first mount).
  const order = useSharedValue<number[]>(days.slice());
  if (order.get().length !== count || days.some((day) => !order.get().includes(day))) {
    order.set(days.slice());
  }
  const activeDay = useSharedValue(-1);
  const dragY = useSharedValue(0);

  const commitOrder = (finalOrder: readonly number[]) => {
    if (finalOrder.some((day, i) => day !== days[i])) {
      onRearrange(finalOrder.slice());
    }
  };

  return (
    <View
      style={[styles.list, { height: Math.max(count * PITCH - ROW_GAP, ROW_HEIGHT) }]}
      testID="rearrange-sheet"
    >
      {days.map((day) => (
        <RearrangeRow
          key={day}
          day={day}
          title={rowTitle(day)}
          order={order}
          activeDay={activeDay}
          dragY={dragY}
          onCommit={commitOrder}
          onDeletePress={() => onDeletePress(day)}
          deleteDisabled={deleteDisabled}
          t={t}
        />
      ))}
    </View>
  );
}

interface RearrangeRowProps {
  day: number;
  title: string;
  order: SharedValue<number[]>;
  activeDay: SharedValue<number>;
  dragY: SharedValue<number>;
  onCommit: (finalOrder: readonly number[]) => void;
  onDeletePress: () => void;
  deleteDisabled: boolean;
  t: TFunction;
}

function RearrangeRow({
  day,
  title,
  order,
  activeDay,
  dragY,
  onCommit,
  onDeletePress,
  deleteDisabled,
  t,
}: RearrangeRowProps) {
  // Captured on gesture start so `indexForOffset` computes the target slot fresh from the total
  // (cumulative) drag distance every tick, rather than compounding rounding error tick-to-tick.
  const dragStartIndex = useSharedValue(0);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          'worklet';
          dragStartIndex.set(order.get().indexOf(day));
          activeDay.set(day);
          dragY.set(0);
        })
        .onUpdate((event) => {
          'worklet';
          const current = order.get();
          const start = dragStartIndex.get();
          // Keep the row inside the list — it can't be dragged past the first/last slot.
          const dy = Math.min(
            Math.max(event.translationY, -start * PITCH),
            (current.length - 1 - start) * PITCH,
          );
          dragY.set(dy);
          const targetIndex = indexForOffset(start, dy, PITCH, current.length);
          const fromIndex = current.indexOf(day);
          if (targetIndex !== fromIndex) {
            order.set(moveItem(current, fromIndex, targetIndex));
          }
        })
        .onEnd(() => {
          'worklet';
          activeDay.set(-1);
          dragY.set(0);
          runOnJS(onCommit)(order.get());
        }),
    [day, order, activeDay, dragY, dragStartIndex, onCommit],
  );

  const style = useAnimatedStyle(() => {
    const slot = order.get().indexOf(day);
    const baseY = (slot === -1 ? 0 : slot) * PITCH;
    if (activeDay.get() === day) {
      // `dragY` is measured from where the drag began, so anchor to the *start* slot — adding it
      // to the live slot double-counts every row crossed and shoots the row off the finger.
      return {
        transform: [{ translateY: dragStartIndex.get() * PITCH + dragY.get() }],
        zIndex: 10,
        opacity: 0.92,
      };
    }
    return {
      transform: [{ translateY: withTiming(baseY, { duration: 220 }) }],
      zIndex: 1,
      opacity: 1,
    };
  });

  return (
    <Animated.View style={[styles.row, style]} testID={`rearrange-row-${day}`}>
      <GestureDetector gesture={gesture}>
        <View style={styles.handle}>
          <Ionicons name="reorder-three" size={22} color={colors.contentM} />
        </View>
      </GestureDetector>

      <Text style={styles.rowTitle} numberOfLines={1}>
        {title}
      </Text>

      <Pressable
        accessibilityRole="button"
        onPress={onDeletePress}
        disabled={deleteDisabled}
        style={[styles.deleteButton, deleteDisabled && styles.deleteButtonDisabled]}
        testID={`rearrange-delete-${day}`}
      >
        <Text style={styles.deleteLabel}>{t('Delete')}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 8, paddingTop: spacing.xl, paddingHorizontal: spacing.lg },
  title: { ...beVietnamPro(20), color: colors.contentB },
  subtitle: { ...beVietnamPro(14), color: colors.contentM, textAlign: 'center' },
  list: { marginTop: spacing.lg, position: 'relative' },
  row: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.neutral50,
    borderRadius: radius.lg,
  },
  handle: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { ...beVietnamPro(15), color: colors.contentB, flex: 1 },
  deleteButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: '#E02624',
  },
  deleteButtonDisabled: { opacity: 0.4 },
  deleteLabel: { ...beVietnamPro(14), color: colors.white },
});
