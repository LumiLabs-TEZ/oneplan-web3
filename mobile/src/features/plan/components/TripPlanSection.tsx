/**
 * Plan tab body — day chip strip, overview map card, timed timeline, and empty state.
 * Port of `TripPlanSection` (`ios/OnePlan/OnePlan/Component/Trip/TripPlanSection.swift`).
 * Rearrange (long-press on a chip) and add-day are wired up in M2.4; this task only ships the
 * read path plus navigation to the (placeholder) new-plan / plan-detail routes.
 */
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { categoryOption } from '@/features/expense/categories';
import { useRequirePro } from '@/features/subscription/useRequirePro';
import type { TripDetail } from '@/features/trip/TripDetailContext';
import { useAppLanguage } from '@/i18n';
import { Button, Spinner } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { DayChipStrip } from './DayChipStrip';
import { DistanceConnector } from './DistanceConnector';
import { PlanItemCard } from './PlanItemCard';
import { PlanItemVoice } from './PlanItemVoice';
import { PlanRouteMapCard } from './PlanRouteMapCard';
import { TripPlanEmpty } from './TripPlanEmpty';
import {
  dayMapPins,
  renderedTimeline,
  visibleItems,
  type TimelineEntry,
} from '../helpers/planDays';
import { openDirections, presentMapsChooser } from '../helpers/openInMaps';
import { useDayRoute } from '../hooks/useDayRoute';
import type { PlanItemDto } from '../types';

export interface NewPlanTarget {
  day: number | null;
  date: string | null;
}

export interface TripPlanSectionProps {
  detail: TripDetail;
  planDay: {
    ctx: import('../helpers/planDays').DayContext;
    days: number[];
    selectedDay: number | null;
    setSelectedDay: (day: number) => void;
    dateForSelected: string | null;
    canAddDay: boolean;
  };
  onNewPlan: (target: NewPlanTarget) => void;
  onItemPress: (item: PlanItemDto) => void;
  onRearrange: () => void;
  onAddDay: () => void;
  readOnly: boolean;
}

export function TripPlanSection({
  detail,
  planDay,
  onNewPlan,
  onItemPress,
  onRearrange,
  onAddDay,
  readOnly,
}: TripPlanSectionProps) {
  const locale = useAppLanguage();
  const { t } = useTranslation();
  const { requirePro } = useRequirePro();
  const { tripId, planItemsLoading } = detail;
  const { ctx, days, selectedDay, setSelectedDay, dateForSelected, canAddDay } = planDay;

  // Single "currently playing" voice note across the visible timeline — mirrors the iOS single
  // `AudioPlayerService` singleton (there's no RN equivalent, so it's lifted state here instead).
  const [playingId, setPlayingId] = useState<number | null>(null);

  // "+ add" moves the selection onto the new day (`triggerAddDay`, TripPlanSection.swift:670-675).
  // The day only exists once `days` catches up (sync local bump, or the optimistic end-date
  // PATCH), so park the target and select it when it shows up. Selection state lives in the
  // screen (`usePlanDay`), so this runs in an effect rather than during this render.
  const pendingNewDay = useRef<number | null>(null);
  useEffect(() => {
    const target = pendingNewDay.current;
    if (target != null && days.includes(target)) {
      pendingNewDay.current = null;
      setSelectedDay(target);
    }
  }, [days, setSelectedDay]);
  const handleAddDay = () => {
    pendingNewDay.current = (days[days.length - 1] ?? 0) + 1;
    onAddDay();
  };

  const items = selectedDay != null ? visibleItems(ctx, selectedDay) : [];
  const pins = dayMapPins(items);
  const route = useDayRoute(
    tripId,
    pins,
    ctx.isPlanningMode && selectedDay != null
      ? { day: selectedDay }
      : dateForSelected
        ? { date: dateForSelected }
        : null,
  );
  const timeline = renderedTimeline(items, locale);

  const goToDayMap = () => {
    if (selectedDay == null) return;
    router.push({
      pathname: '/trip/[tripId]/plan/day-map',
      params: {
        tripId: String(tripId),
        day: ctx.isPlanningMode ? String(selectedDay) : undefined,
        date: dateForSelected ?? undefined,
      },
    });
  };

  const handleNewPlan = () => {
    onNewPlan({
      day: ctx.isPlanningMode ? selectedDay : null,
      date: ctx.isPlanningMode ? null : dateForSelected,
    });
  };

  // iOS `handleExploreOnMarketTap`: Pro opens the market cover, free users get the paywall.
  const exploreMarket = () =>
    requirePro(() => router.push({ pathname: '/market', params: { tripId: String(tripId) } }));

  const handleDistancePress = (entry: TimelineEntry) => {
    if (!entry.routeToNext) return;
    const { from, to, fromName, toName, fromAddress, toAddress } = entry.routeToNext;
    presentMapsChooser(t, (choice) => {
      void openDirections(
        {
          origin: from,
          destination: to,
          mode: 'car',
          name: toName,
          address: toAddress,
          originName: fromName,
          originAddress: fromAddress,
        },
        choice,
        t,
      );
    });
  };

  return (
    <View
      style={[styles.root, !planItemsLoading && timeline.length === 0 && styles.fill]}
      testID="trip-plan-section"
    >
      <DayChipStrip
        ctx={ctx}
        days={days}
        selected={selectedDay}
        onSelect={setSelectedDay}
        onLongPress={readOnly ? undefined : onRearrange}
        onAddDay={canAddDay ? handleAddDay : undefined}
        readOnly={readOnly}
        locale={locale}
      />

      {!planItemsLoading && pins.length >= 2 ? (
        <PlanRouteMapCard
          title={t('Plan overview')}
          pins={route.pins}
          legs={route.legs}
          onViewDetails={goToDayMap}
          onPinPress={goToDayMap}
        />
      ) : null}

      {planItemsLoading ? (
        <Spinner />
      ) : timeline.length === 0 ? (
        // The empty card stretches down to New Plan (iOS `maxHeight: .infinity`).
        <View style={[styles.emptyBlock, styles.fill]}>
          <TripPlanEmpty style={styles.fill} />
          {readOnly ? null : detail.planItems.length === 0 ? (
            // A trip with no plans at all also offers the market (TripPlanSection.swift:396-405).
            <View style={styles.emptyActions}>
              <Button
                variant="dark"
                title={t('Explore on market')}
                onPress={exploreMarket}
                style={[styles.flex, styles.exploreButton]}
                textStyle={styles.exploreTitle}
                testID="plan-explore-market"
              />
              <Button
                title={t('New Plan')}
                onPress={handleNewPlan}
                style={styles.flex}
                testID="plan-new-button"
              />
            </View>
          ) : (
            <Button
              title={t('New Plan')}
              onPress={handleNewPlan}
              style={styles.newPlanButton}
              testID="plan-new-button"
            />
          )}
        </View>
      ) : (
        <View style={styles.timeline}>
          {timeline.map((entry) => (
            <View key={entry.item.id} style={styles.timelineRow}>
              <View style={styles.timeColumn}>
                <Text style={styles.timeLabel} numberOfLines={1}>
                  {entry.timeLabel ?? ''}
                </Text>
                <View style={styles.timeRule} />
              </View>

              <View style={styles.itemColumn}>
                <PlanItemVoice
                  item={entry.item}
                  active={playingId === entry.item.id}
                  onActivate={setPlayingId}
                >
                  {(voice) => (
                    <PlanItemCard
                      item={entry.item}
                      markerColor={
                        entry.item.category
                          ? categoryOption(entry.item.category).color
                          : colors.warning500
                      }
                      onPress={() => onItemPress(entry.item)}
                      voice={voice}
                      testID={`plan-item-${entry.item.id}`}
                      voiceTestID={`voice-pill-${entry.item.id}`}
                    />
                  )}
                </PlanItemVoice>

                {!entry.isLast ? (
                  entry.distanceToNext ? (
                    <DistanceConnector
                      label={entry.distanceToNext}
                      onPress={entry.routeToNext ? () => handleDistancePress(entry) : undefined}
                      testID={`plan-distance-${entry.item.id}`}
                    />
                  ) : (
                    <View style={styles.spacer} />
                  )
                ) : null}
              </View>
            </View>
          ))}

          {!readOnly ? (
            <Button
              title={t('New Plan')}
              onPress={handleNewPlan}
              style={styles.newPlanButton}
              testID="plan-new-button"
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  fill: { flexGrow: 1 },
  emptyBlock: { gap: 12 },
  emptyActions: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  // Match the primary New Plan capsule beside it: 48pt tall, regular 16pt system text.
  exploreButton: { height: 48 },
  exploreTitle: {
    fontFamily: Platform.select({ ios: 'System', default: 'sans-serif' }),
    fontSize: 16,
    fontWeight: '400',
  },
  timeline: { paddingBottom: 12 },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  timeColumn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6 },
  timeLabel: { ...beVietnamPro(14), color: colors.contentM, width: 44 },
  timeRule: { width: 24, height: 1, backgroundColor: colors.contentL, opacity: 0.55 },
  itemColumn: { flex: 1 },
  spacer: { height: 10 },
  newPlanButton: { marginTop: 12 },
});
