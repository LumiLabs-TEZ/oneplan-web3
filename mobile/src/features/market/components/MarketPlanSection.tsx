/**
 * Itinerary for the listing detail and the Upload Trip editor — port of
 * `MarketPlanSection(mode: .full)` (`ios/OnePlan/OnePlan/Component/Marketplace/MarketPlanSection.swift`):
 * a "Day N" chip strip, then the selected day's hourly timeline of `MarketPlanItemCard`s. Passing
 * the edit callbacks adds the "+ add" chip, long-press day delete and the "New Plan" button
 * (`MarketPlanSection.swift:305-405`). Chips animate like the Trip Detail `DayChipStrip`: a new
 * day zooms in, later chips and "+ add" slide over, the selected fill cross-fades, and the strip
 * scrolls to the new end — all instant under Reduce Motion.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';

import { categoryOption } from '@/features/expense/categories';
import { PlanImageStrip } from '@/features/plan/components/PlanImageStrip';
import { useAppLanguage } from '@/i18n';
import { Button } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import type { MarketItem } from '../api/queries';
import { marketTimeline } from '../helpers/marketTimeline';

export interface MarketPlanSectionProps {
  items: readonly MarketItem[];
  durationDays: number;
  onItemPress: (item: MarketItem) => void;
  /** Editor only: shows the "New Plan" button, called with the selected day. */
  onAddPlan?: (day: number) => void;
  /** Editor only: shows the trailing "+ add" chip while `canAddDay`. */
  onAddDay?: () => void;
  canAddDay?: boolean;
  /** Editor only: long-press delete, offered while more than one day exists. */
  onDeleteDay?: (day: number) => void;
}

// Same timings as `DayChipStrip`: timed, not sprung, so a new chip doesn't wobble into "+ add".
const SELECT_FADE_MS = 200;
const CHIP_ANIM_MS = 240;
const chipLayout = LinearTransition.duration(CHIP_ANIM_MS);
const chipEntering = ZoomIn.duration(CHIP_ANIM_MS);

export function MarketPlanSection({
  items,
  durationDays,
  onItemPress,
  onAddPlan,
  onAddDay,
  canAddDay = false,
  onDeleteDay,
}: MarketPlanSectionProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const [selectedDay, setDay] = useState(1);
  const dayCount = Math.max(1, durationDays);
  // A deleted trailing day falls back to Day 1 (`MarketPlanSection.swift` `.onChange`).
  const day = selectedDay > dayCount ? 1 : selectedDay;
  const days = Array.from({ length: dayCount }, (_, index) => index + 1);
  const rows = marketTimeline(items, day);
  const reducedMotion = useReducedMotion();
  const layout = reducedMotion ? undefined : chipLayout;
  const scrollRef = useRef<ScrollView>(null);
  // Only days added through "+ add" pop in and scroll into view — not the editor's async trip
  // import, which grows the strip from 1 to N days after mount.
  const [addedAfter, setAddedAfter] = useState(Number.POSITIVE_INFINITY);
  const lastDayCount = useRef(dayCount);
  useEffect(() => {
    if (dayCount > lastDayCount.current && dayCount > addedAfter) {
      scrollRef.current?.scrollToEnd({ animated: !reducedMotion });
    }
    lastDayCount.current = dayCount;
  }, [dayCount, addedAfter, reducedMotion]);

  const confirmDelete = (value: number) => {
    if (!onDeleteDay || dayCount <= 1) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      t('Delete Day %lld?', { 0: value }),
      t('All plans on Day %lld will be deleted. Plans on later days will be moved up.', {
        0: value,
      }),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: () => {
            onDeleteDay(value);
            if (day === value) setDay(Math.max(value - 1, 1));
            else if (day > value) setDay(day - 1);
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        testID="market-day-chips"
      >
        {days.map((value) => {
          const selected = value === day;
          return (
            <Animated.View
              key={value}
              layout={layout}
              entering={reducedMotion || value <= addedAfter ? undefined : chipEntering}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                testID={`market-day-chip-${value}`}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setDay(value);
                }}
                onLongPress={onDeleteDay ? () => confirmDelete(value) : undefined}
                delayLongPress={100}
              >
                <ChipFill selected={selected} animate={!reducedMotion}>
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                    {t('Day %lld', { 0: value })}
                  </Text>
                </ChipFill>
              </Pressable>
            </Animated.View>
          );
        })}
        {onAddDay && canAddDay ? (
          <Animated.View layout={layout}>
            <Pressable
              accessibilityRole="button"
              testID="market-add-day-chip"
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setAddedAfter(dayCount);
                onAddDay();
              }}
              style={styles.chip}
            >
              <Text style={styles.chipText}>{t('+ add')}</Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </ScrollView>
      {rows.length === 0 ? (
        <Text style={styles.empty}>{t('No plans for this day')}</Text>
      ) : (
        <View style={styles.timeline}>
          {rows.map((row) => (
            <View key={row.hour ?? 'untimed'} style={styles.row}>
              <View style={styles.hourColumn}>
                <Text style={styles.hour}>
                  {row.hour == null ? '' : `${String(row.hour).padStart(2, '0')}:00`}
                </Text>
                {row.hour == null ? null : <View style={styles.tick} />}
              </View>
              <View style={styles.cards}>
                {row.items.map((item) => (
                  <MarketPlanItemCard key={item.id} item={item} onPress={() => onItemPress(item)} />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
      {onAddPlan ? (
        <Button
          title={t('New Plan')}
          testID="market-new-plan"
          style={styles.newPlan}
          onPress={() => onAddPlan(day)}
        />
      ) : null}
    </View>
  );
}

/** Chip background that cross-fades surface ⇄ blue when the selection moves (`DayChipStrip`). */
function ChipFill({
  selected,
  animate,
  children,
}: {
  selected: boolean;
  animate: boolean;
  children: ReactNode;
}) {
  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    const target = selected ? 1 : 0;
    progress.set(animate ? withTiming(target, { duration: SELECT_FADE_MS }) : target);
  }, [selected, animate, progress]);
  const fill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], [colors.white, colors.blueBase]),
  }));
  return <Animated.View style={[styles.chip, fill]}>{children}</Animated.View>;
}

/** `MarketPlanItemCard` (`MarketPlanSection.swift:65-139`). */
function MarketPlanItemCard({ item, onPress }: { item: MarketItem; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable onPress={onPress} style={styles.card} testID={`market-plan-item-${item.id}`}>
      <View>
        <View style={styles.titleRow}>
          <View
            style={[
              styles.marker,
              {
                backgroundColor: item.category
                  ? categoryOption(item.category).color
                  : colors.warning500,
              },
            ]}
          />
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
        </View>
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={12} color={colors.contentM} />
          <Text style={styles.location} numberOfLines={1}>
            {item.location || t('No location')}
          </Text>
        </View>
      </View>
      {item.description ? (
        <>
          <DottedDivider />
          <Text style={styles.description} numberOfLines={2}>
            {item.description}
          </Text>
        </>
      ) : null}
      {item.imageUrls.length > 0 ? <PlanImageStrip images={item.imageUrls} size={90} /> : null}
    </Pressable>
  );
}

function DottedDivider() {
  return (
    <Svg height={1} width="100%">
      <Line
        x1={0}
        y1={0.5}
        x2="100%"
        y2={0.5}
        stroke={colors.neutral200}
        strokeOpacity={0.85}
        strokeWidth={1}
        strokeDasharray="3 3"
        strokeLinecap="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12, paddingBottom: 12 },
  chips: { gap: 8, paddingHorizontal: 1, paddingVertical: 6 },
  chip: {
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 16,
    justifyContent: 'center',
    backgroundColor: colors.white,
    boxShadow: '0px 1px 5px rgba(0,0,0,0.06)',
  },
  chipText: { ...beVietnamPro(15, 'medium'), color: colors.contentB },
  chipTextSelected: { color: colors.white },
  empty: {
    ...beVietnamPro(14),
    color: colors.contentM,
    textAlign: 'center',
    paddingVertical: 20,
  },
  timeline: { gap: 14 },
  newPlan: { marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  hourColumn: { width: 44, gap: 8, paddingTop: 6 },
  hour: { ...beVietnamPro(14), color: colors.contentM },
  tick: { width: 24, height: 1, backgroundColor: colors.contentL, opacity: 0.55 },
  cards: { flex: 1, gap: 10 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 12,
    gap: 8,
    boxShadow: '0px 0px 17.9px rgba(0,0,0,0.06)',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  marker: { width: 12, height: 12, borderRadius: 6 },
  title: { ...beVietnamPro(16, 'medium'), letterSpacing: -0.64, color: colors.contentB, flex: 1 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 5 },
  location: { ...beVietnamPro(14), letterSpacing: -0.6, color: colors.contentM, flex: 1 },
  description: { ...beVietnamPro(13), letterSpacing: -0.39, color: colors.contentM },
});
