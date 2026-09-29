/**
 * Full-screen day map — port of `ios/OnePlan/OnePlan/View/Plan/PlanDayMapView.swift`.
 * Params: `{ date, day? }` (both strings — `tripId` comes from the `TripDetailProvider`
 * context, same as every other screen nested under `trip/[tripId]`). When `day` is present
 * (planning-mode day chips) pins come from `visibleItems`; otherwise (ongoing/ended trips,
 * e.g. Home's "Today's activities") this filters `planItems` by `planDate === date` directly —
 * the simplest correct read given `date` is already the resolved calendar day, without needing
 * to reverse it through `dateForDay`.
 */
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelRatio, Platform, StyleSheet, Text, View } from 'react-native';
import MapView from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DayMapSheet, RouteLayer, RouteTraveler } from '@/features/plan/components';
import {
  cameraTargets,
  focusedLeg,
  highlightedLegIndex,
  onUserPan,
  sheetRows,
  togglePin,
  travelerPath,
  type DayMapState,
} from '@/features/plan/helpers/dayMapSelection';
import { fittedRegion, metersPerPoint, walkDashPattern } from '@/features/plan/helpers/geo';
import { dayMapPins, visibleItems, type DayContext } from '@/features/plan/helpers/planDays';
import { useDayRoute } from '@/features/plan/hooks/useDayRoute';
import { parseDateOnly, formatMonthDay } from '@/features/trip/helpers/dateRange';
import { useTripCore, useTripPlanItems } from '@/features/trip/TripDetailContext';
import { useAppLanguage } from '@/i18n';
import { isMapAvailable, mapProvider } from '@/native/maps/provider';
import { MapUnavailable } from '@/native/maps/MapUnavailable';
import { GLASS_ICON_BUTTON_SIZE } from '@/ui/components/GlassIconButton';
import { BackButton } from '@/ui/components/BackButton';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

/** Camera fit stays "programmatic" for this long — user pans/zooms inside the window are
 * ignored so our own `fitToCoordinates` calls don't immediately collapse the sheet. */
const PROGRAMMATIC_WINDOW_MS = 1500;

export default function DayMapScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const locale = useAppLanguage();
  const insets = useSafeAreaInsets();
  const { tripId, trip } = useTripCore();
  const { planItems } = useTripPlanItems();
  const { date, day } = useLocalSearchParams<{ date: string; day?: string }>();
  const dayNumber = day != null ? Number(day) : null;

  const items = useMemo(() => {
    if (dayNumber != null) {
      const ctx: DayContext = {
        isPlanningMode: trip?.status === 'PLANNING',
        startDate: trip?.startDate ?? null,
        endDate: trip?.endDate ?? null,
        planItems,
      };
      return visibleItems(ctx, dayNumber);
    }
    return planItems.filter((item) => item.planDate === date);
  }, [dayNumber, date, planItems, trip?.status, trip?.startDate, trip?.endDate]);

  const pins = useMemo(() => dayMapPins(items), [items]);
  // `day` is only passed for planning-mode trips, whose items have no `planDate` yet.
  const route = useDayRoute(
    tripId,
    pins,
    dayNumber != null ? { day: dayNumber } : date ? { date } : null,
  );

  const [state, setState] = useState<DayMapState>({ selectedPinId: null, sheet: 'expanded' });

  const mapRef = useRef<MapView>(null);
  const programmaticUntil = useRef(0);
  const [mapReady, setMapReady] = useState(false);
  // Zoom inputs for the walking-leg dash size (iOS Google Maps measures dashes in meters).
  const [latitudeDelta, setLatitudeDelta] = useState(() => fittedRegion(pins).latitudeDelta);
  const [mapHeight, setMapHeight] = useState(0);
  const walkDash = useMemo(
    () => walkDashPattern(Platform.OS, metersPerPoint(latitudeDelta, mapHeight), PixelRatio.get()),
    [latitudeDelta, mapHeight],
  );

  const fitTo = (targets: { latitude: number; longitude: number }[]) => {
    if (targets.length === 0) return;
    programmaticUntil.current = Date.now() + PROGRAMMATIC_WINDOW_MS;
    mapRef.current?.fitToCoordinates(targets, {
      edgePadding: { top: 120, right: 48, bottom: 140, left: 48 },
      animated: true,
    });
  };

  // `route.legs` is rebuilt every render, so key the refit on its shape instead: it changes when
  // the driving routes arrive (straight 2-point legs → road polylines) or the stops change.
  const legsKey = route.legs.map((leg) => leg.points.length).join(',');

  // Fit once the map has laid out (`fitToCoordinates` before `onMapReady` can use a zero-size
  // viewport and under-zoom), then refit when the selection changes or the road routes load
  // (`PlanDayMapView.onAppear` / `.onChange(of: selectedPinIndex)`).
  useEffect(() => {
    if (!mapReady) return;
    fitTo(cameraTargets(pins, state.selectedPinId, route.legs));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `legsKey` stands in for `route.legs`
  }, [mapReady, pins, state.selectedPinId, legsKey]);

  // The animated car drives the highlighted leg — only while a stop is selected.
  const carPath = useMemo(
    () => travelerPath(pins, route.legs, state.selectedPinId),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `legsKey` stands in for `route.legs`
    [pins, legsKey, state.selectedPinId],
  );

  const collapseToMini = () => {
    if (Date.now() < programmaticUntil.current) return;
    setState((s) => onUserPan(s));
  };

  const selectPin = (pinId: number) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setState((s) => togglePin(s, pinId));
  };

  const dayLabel =
    dayNumber != null
      ? t('Day %lld', { 0: dayNumber })
      : date
        ? formatMonthDay(parseDateOnly(date), locale)
        : '';
  const title = t('%@ overview', { 0: dayLabel });
  const subtitle = t('%lld stops', { count: pins.length });

  const rows = useMemo(() => sheetRows(pins, route.legs, locale, t), [pins, route.legs, locale, t]);
  const highlightedLeg = highlightedLegIndex(pins, state.selectedPinId);
  const miniLeg = focusedLeg(pins, route.legs, state.selectedPinId, locale, t);

  return (
    <View style={styles.root}>
      {isMapAvailable() ? (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={mapProvider()}
          initialRegion={fittedRegion(pins)}
          mapPadding={{
            top: 0,
            right: 0,
            left: 0,
            bottom: 300,
          }}
          onMapReady={() => setMapReady(true)}
          onPanDrag={collapseToMini}
          onLayout={(e) => setMapHeight(e.nativeEvent.layout.height)}
          onRegionChangeComplete={(region, details) => {
            setLatitudeDelta(region.latitudeDelta);
            if (details.isGesture) collapseToMini();
          }}
        >
          <RouteLayer
            pins={pins}
            legs={route.legs}
            highlightedLeg={highlightedLeg ?? undefined}
            focusMode={state.selectedPinId != null}
            onPinPress={(pin) => selectPin(pin.id)}
            selectedPinId={state.selectedPinId ?? undefined}
            walkDashPattern={mapHeight > 0 ? walkDash : undefined}
          />
          <RouteTraveler
            points={carPath}
            durationMs={8000}
            mode={highlightedLeg != null ? route.legs[highlightedLeg]?.mode : undefined}
            testID="day-map-traveler"
          />
        </MapView>
      ) : (
        <MapUnavailable style={StyleSheet.absoluteFill} />
      )}

      <View style={[styles.header, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <BackButton testID="day-map-back" />
        <Text style={styles.headerTitle} numberOfLines={1}>
          {dayLabel}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <DayMapSheet
        title={title}
        subtitle={subtitle}
        rows={rows}
        state={state}
        focusedLeg={miniLeg}
        onRowPress={selectPin}
        onHeaderPress={() =>
          setState((s) =>
            s.sheet === 'mini'
              ? { ...s, sheet: 'expanded' }
              : { selectedPinId: null, sheet: 'expanded' },
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  headerTitle: {
    ...beVietnamPro(17, 'medium'),
    color: colors.contentB,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: { width: GLASS_ICON_BUTTON_SIZE },
});
