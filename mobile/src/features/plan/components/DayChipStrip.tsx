/**
 * Day/date chip strip for the Plan tab — port of `TripPlanSection.dayDateChipsView`
 * (`ios/OnePlan/OnePlan/Component/Trip/TripPlanSection.swift:641-702`). A long press on any
 * chip opens the rearrange sheet (M2.4); the trailing "+ add" chip only renders when the trip
 * can still grow (`canAddDay`) and the strip isn't read-only.
 *
 * Animated like the SwiftUI strip: a newly added chip springs in, the chips after it (and
 * "+ add") slide over, the selected fill cross-fades, and the strip scrolls to the new end.
 * Everything is instant under Reduce Motion.
 */
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { dayChipLabel, type DayContext } from '../helpers/planDays';

export interface DayChipStripProps {
  ctx: DayContext;
  days: readonly number[];
  selected: number | null;
  onSelect: (day: number) => void;
  /** Long-press (450 ms) opens the rearrange sheet. Omit to disable. */
  onLongPress?: () => void;
  /** Omit (or leave `readOnly`) to hide the trailing "+ add" chip. */
  onAddDay?: () => void;
  readOnly: boolean;
  locale: 'en' | 'vi';
}

const LONG_PRESS_MS = 450;
const SELECT_FADE_MS = 200;
// Timed, not sprung: a spring overshoots the chip past full size and wobbles it into "+ add".
const CHIP_ANIM_MS = 240;
const chipLayout = LinearTransition.duration(CHIP_ANIM_MS);
const chipEntering = ZoomIn.duration(CHIP_ANIM_MS);

export function DayChipStrip({
  ctx,
  days,
  selected,
  onSelect,
  onLongPress,
  onAddDay,
  readOnly,
  locale,
}: DayChipStripProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  // Chips present on first render shouldn't pop in; only later insertions animate.
  const [initialDays] = useState(() => new Set(days));
  // A day was appended: bring the new end of the strip into view.
  const lastDayCount = useRef(days.length);
  useEffect(() => {
    if (days.length > lastDayCount.current) {
      scrollRef.current?.scrollToEnd({ animated: !reducedMotion });
    }
    lastDayCount.current = days.length;
  }, [days.length, reducedMotion]);

  if (days.length === 0) return null;

  const layout = reducedMotion ? undefined : chipLayout;

  const handleSelect = (day: number) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(day);
  };

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      // A ScrollView flex-grows by default; the Plan tab's column now stretches (full-height
      // empty card), so pin the strip to its content height.
      style={styles.strip}
      testID="day-chip-strip"
    >
      <View style={styles.row}>
        {days.map((day) => {
          const { dateLabel, dayNumber } = dayChipLabel(ctx, day, locale);
          const isSelected = selected === day;
          return (
            <Animated.View
              key={day}
              layout={layout}
              entering={reducedMotion || initialDays.has(day) ? undefined : chipEntering}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => handleSelect(day)}
                onLongPress={onLongPress}
                delayLongPress={LONG_PRESS_MS}
                testID={`plan-day-chip-${day}`}
              >
                <ChipFill selected={isSelected} animate={!reducedMotion}>
                  {dateLabel ? (
                    <Text
                      style={[styles.dateLabel, isSelected && styles.dateLabelSelected]}
                      numberOfLines={1}
                    >
                      {dateLabel}
                    </Text>
                  ) : null}
                  <Text
                    style={
                      isSelected
                        ? styles.dayLabelSelected
                        : dateLabel
                          ? styles.dayLabelWithDate
                          : styles.dayLabel
                    }
                    numberOfLines={1}
                  >
                    {t('Day %lld', { 0: dayNumber })}
                  </Text>
                </ChipFill>
              </Pressable>
            </Animated.View>
          );
        })}

        {!readOnly && onAddDay ? (
          <Animated.View layout={layout}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onAddDay();
              }}
              style={styles.addChip}
              testID="plan-add-day-chip"
            >
              <Text style={styles.addLabel}>{t('+ add')}</Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </View>
    </ScrollView>
  );
}

/** Chip background that cross-fades surface ⇄ blue when the selection moves. */
function ChipFill({
  selected,
  animate,
  children,
}: {
  selected: boolean;
  animate: boolean;
  children: React.ReactNode;
}) {
  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    const target = selected ? 1 : 0;
    progress.set(animate ? withTiming(target, { duration: SELECT_FADE_MS }) : target);
  }, [selected, animate, progress]);
  const fill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], [colors.surface, colors.blueBase]),
  }));
  return (
    <Animated.View style={[styles.chip, selected && styles.chipSelected, fill]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  strip: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  chipSelected: { backgroundColor: colors.blueBase, shadowOpacity: 0, elevation: 0 },
  dateLabel: { ...beVietnamPro(15, 'medium'), color: colors.contentM },
  dateLabelSelected: { color: 'rgba(255, 255, 255, 0.7)' },
  /** No-date chip, unselected: regular weight (`TripPlanSection.chip(for:)`'s `else` branch). */
  dayLabel: { ...beVietnamPro(17, 'regular'), color: colors.contentB },
  /** With-date chip, unselected: the day number is always semibold regardless of selection. */
  dayLabelWithDate: { ...beVietnamPro(17, 'semibold'), color: colors.contentB },
  dayLabelSelected: { ...beVietnamPro(17, 'semibold'), color: colors.white },
  addChip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  addLabel: { ...beVietnamPro(15, 'medium'), color: colors.contentB },
});
