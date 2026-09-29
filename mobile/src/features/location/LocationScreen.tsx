/**
 * Location-detail screen — search sheet + detail sheet + full-screen map. Pick mode is pushed by
 * `PlanForm`'s location row (`{ tripId, mode: 'pick' }`) and hands the result back via
 * `locationPickStore`; view mode (a later task) opens directly on a known place. Port of
 * `LocationDetailView`/`ChooseLocationView`
 * (`ios/OnePlan/OnePlan/View/LocationDetailView.swift:150-232, 360-560, 740-1000`,
 * `ios/OnePlan/OnePlan/Component/BottomSheet/ChooseLocationView.swift`).
 *
 * Always presented full-screen (`presentation: 'fullScreenModal'` in `[tripId]/_layout.tsx` and
 * `market/_layout.tsx`), like iOS's `.fullScreenCover`.
 *
 * Own `BottomSheetModalProvider`: this route is itself presented as a native modal, and the root provider's portal host sits
 * BELOW that modal — nesting a provider here puts the host where this screen's sheet actually
 * needs it (same lesson as `trip/new/_layout.tsx`).
 */
import { useMe } from '@/features/me/useMe';
import { boardPickStore } from '@/features/board/boardPickStore';
import { pinPlanItems } from '@/features/board/helpers/schedule';
import { createPlanItem, invalidatePlanItems } from '@/features/plan/api/mutations';
import { queryClient } from '@/api/queryClient';
import { requireOnline } from '@/offline/guardOnline';
import type BottomSheetType from '@gorhom/bottom-sheet';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, useWindowDimensions, View } from 'react-native';
import type MapView from 'react-native-maps';
import type { Region } from 'react-native-maps';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type EntryAnimationsValues,
  type ExitAnimationsValues,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CompassPill,
  DirectionsOverlay,
  DirectionsPolyline,
  LocationHeader,
  MapCompassButton,
  LocationMap,
  LocationSheet,
  PoweredBy,
  type LocationDetailPlace,
} from '@/features/location/components';
import { directionsCamera, directionsModel } from '@/features/location/helpers/directions';
import { formatLocationDistance } from '@/features/location/helpers/locationDistance';
import { useDeviceHeading } from '@/features/location/hooks/useDeviceHeading';
import { useDirections } from '@/features/location/hooks/useDirections';
import { useLocationCamera } from '@/features/location/hooks/useLocationCamera';
import { useUserLocation } from '@/features/location/hooks/useUserLocation';
import { selectableRecents } from '@/features/location/helpers/selectableRecents';
import { useLocationPickStore } from '@/features/location/locationPickStore';
import type { LocationPick } from '@/features/location/types';
import { useRecentLocations, useSaveRecentLocation } from '@/features/location/api/recentLocations';
import type { RecentLocationDto } from '@/features/location/api/recentLocations';
import { useSuggestedNearby, usePlaceSearch } from '@/features/location/usePlaceSearch';
import { fittedRegion, haversineMeters, type LatLng } from '@/features/plan/helpers/geo';
import { useAppLanguage } from '@/i18n';
import { placeSearchProvider, type PlacePrediction } from '@/native/maps/placeSearch';
import { MAP_DEFAULTS } from '@/native/maps/provider';
import { GlassIconButton } from '@/ui/components';
import { colors } from '@/ui/theme';

type PickerMode = 'pick' | 'view';

interface LocationScreenParams {
  tripId: string;
  mode?: string;
  name?: string;
  lat?: string;
  lng?: string;
  address?: string;
  category?: string;
}

interface DisplayedPlace extends LocationDetailPlace {
  latitude: number;
  longitude: number;
  source: LocationPick['source'];
}

/** Ho Chi Minh City — used only as a last-resort map center before the user's fix (or a `view`
 * param place) resolves. */
const FALLBACK_CENTER: LatLng = { latitude: 10.77, longitude: 106.7 };

/** iOS `compassWidgetSheetGap` — the compass floats this far above the sheet's top edge. */
const COMPASS_SHEET_GAP = 8;
/** `LocationSheet`'s resting detent for detail content (`restingIndex`). */
const DETAIL_RESTING_INDEX = 1;

/** iOS `directionsOverlays` transition: `.move(edge: .bottom).combined(with: .opacity)` over the
 * 0.35s `easeInOut` of `enterDirectionsMode` / `exitDirectionsMode`. */
const DIRECTIONS_TIMING = { duration: 350, easing: Easing.inOut(Easing.ease) };
const directionsEntering = (values: EntryAnimationsValues) => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: values.targetHeight + 24 }] },
    animations: {
      opacity: withTiming(1, DIRECTIONS_TIMING),
      transform: [{ translateY: withTiming(0, DIRECTIONS_TIMING) }],
    },
  };
};
const directionsExiting = (values: ExitAnimationsValues) => {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
    animations: {
      opacity: withTiming(0, DIRECTIONS_TIMING),
      transform: [{ translateY: withTiming(values.currentHeight + 24, DIRECTIONS_TIMING) }],
    },
  };
};

function placeFromParams(params: LocationScreenParams): DisplayedPlace | null {
  if (!params.name || !params.lat || !params.lng) return null;
  const latitude = Number(params.lat);
  const longitude = Number(params.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    name: params.name,
    latitude,
    longitude,
    address: params.address ?? null,
    category: params.category ?? null,
    source: 'search',
  };
}

function pickFromPrediction(place: PlacePrediction, source: LocationPick['source']): LocationPick {
  return {
    name: place.name,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    category: place.category,
    source,
  };
}

/** Recents predating a coordinate on the server (pre-M3.3 saves, or a save that raced a geocode
 * failure) are filtered out of the selectable list before this ever runs (see
 * `selectableRecents` below) — `LocationPick` must never carry fake `(0, 0)` coordinates, so a
 * recent without a coordinate is simply not offered for reselection. */
function pickFromRecent(
  recent: RecentLocationDto & { latitude: number; longitude: number },
): LocationPick {
  return {
    name: recent.name,
    address: recent.address ?? null,
    latitude: recent.latitude,
    longitude: recent.longitude,
    category: recent.pointOfInterestCategory ?? null,
    source: 'recent',
  };
}

export default function PlanLocationPickerScreen() {
  return (
    <BottomSheetModalProvider>
      <LocationScreenBody />
    </BottomSheetModalProvider>
  );
}

function LocationScreenBody() {
  useAppLanguage();
  const { t } = useTranslation();
  const locale = useAppLanguage();
  const params = useLocalSearchParams<{
    tripId: string;
    mode?: string;
    name?: string;
    lat?: string;
    lng?: string;
    address?: string;
    category?: string;
  }>();
  const me = useMe();
  const bulkProgress = useRef<{
    pins: import('@/features/board/types').PinInput[];
    saved: number;
  } | null>(null);
  const bulkBusy = useRef(false);
  const mode: PickerMode = params.mode === 'view' ? 'view' : 'pick';
  const { height: windowHeight } = useWindowDimensions();

  const initialPlace = useMemo(
    () => (mode === 'view' ? placeFromParams(params) : null),
    [mode, params],
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [sheetContent, setSheetContent] = useState<'search' | 'detail'>(
    mode === 'view' ? 'detail' : 'search',
  );
  const [displayedPlace, setDisplayedPlace] = useState<DisplayedPlace | null>(initialPlace);
  // iOS `selectedPOICoordinate`: set on every selection (and a view-mode entry), cleared by a
  // plain map tap or returning to search.
  const [calloutVisible, setCalloutVisible] = useState(initialPlace != null);
  const sheetPosition = useSharedValue(windowHeight);
  const compassStyle = useAnimatedStyle(() => ({
    bottom: windowHeight - sheetPosition.value + COMPASS_SHEET_GAP,
  }));
  const [directionsCardHeight, setDirectionsCardHeight] = useState(0);
  /** Live camera heading for `MapCompassButton`; shown only while rotated or tilted, like Google's. */
  const mapHeading = useSharedValue(0);
  const [mapOffNorth, setMapOffNorth] = useState(false);
  /** Locate button offset while directions are up (above the control card); `-1` = follow the sheet. */
  const locateDirectionsBottom = useSharedValue(-1);
  // One animated style for both states: Reanimated keeps the last animated value on the view, so
  // swapping to a plain style object would leave the button stuck at its sheet-following offset.
  // It rides the sheet's top-right corner and fades out once the sheet is pulled into the upper
  // part of the screen (expanded search), where it would crowd the header.
  const locateStyle = useAnimatedStyle(() =>
    locateDirectionsBottom.value >= 0
      ? { bottom: locateDirectionsBottom.value, opacity: 1 }
      : {
          bottom: windowHeight - sheetPosition.value + COMPASS_SHEET_GAP,
          opacity: sheetPosition.value < windowHeight * 0.35 ? 0 : 1,
        },
  );

  const mapRef = useRef<MapView>(null);
  /** When the last place was picked — a map press right after a pick belongs to that pick. */
  const lastSelectAtRef = useRef(0);
  const sheetRef = useRef<BottomSheetType>(null);

  const { coords: userCoords } = useUserLocation();
  const deviceHeading = useDeviceHeading();
  const placeLatLng: LatLng | null = displayedPlace
    ? { latitude: displayedPlace.latitude, longitude: displayedPlace.longitude }
    : null;

  const camera = useLocationCamera(mapRef, placeLatLng);
  const distanceText =
    userCoords && placeLatLng
      ? formatLocationDistance(haversineMeters(userCoords, placeLatLng), locale)
      : null;
  const directions = useDirections(placeLatLng, locale, t);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    locateDirectionsBottom.set(
      directions.active && directionsCardHeight > 0
        ? insets.bottom + 12 + directionsCardHeight + COMPASS_SHEET_GAP
        : -1,
    );
  }, [directions.active, directionsCardHeight, insets.bottom, locateDirectionsBottom]);

  const search = usePlaceSearch(searchQuery, userCoords);
  const suggested = useSuggestedNearby(userCoords);
  const recents = useRecentLocations();
  const saveRecent = useSaveRecentLocation();
  const provider = placeSearchProvider();

  const initialRegion = useMemo<Region>(
    () => fittedRegion([initialPlace ?? userCoords ?? FALLBACK_CENTER], 1, 0.02),
    // Mount-only initial region (mirrors `day-map.tsx`'s `initialRegion` pattern) — later camera
    // moves are imperative (`useLocationCamera`), not driven by re-renders of this value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Picker entry (no place yet) centers the map on the user once their fix resolves, matching
  // `LocationDetailView`'s picker-mode `.task` (`:214-233`).
  useEffect(() => {
    if (mode !== 'pick' || displayedPlace || !userCoords) return;
    mapRef.current?.animateCamera(
      { center: userCoords, pitch: 0, zoom: MAP_DEFAULTS.zoom3D },
      { duration: 400 },
    );
  }, [mode, displayedPlace, userCoords]);

  function selectPlace(pick: LocationPick) {
    lastSelectAtRef.current = Date.now();
    // iOS `handlePOISelection`: picking a place (e.g. a POI tapped on the directions map) exits
    // directions mode so the new place's detail sheet takes over.
    if (directions.active) directions.stop();
    saveRecent(pick);
    setDisplayedPlace({
      name: pick.name,
      address: pick.address,
      latitude: pick.latitude,
      longitude: pick.longitude,
      category: pick.category,
      source: pick.source,
    });
    setCalloutVisible(true);
    setSheetContent('detail');
    // Re-picking from the peek (a POI tapped on the flattened map) keeps `content` at 'detail',
    // so `LocationSheet`'s content effect won't fire — raise it back to the resting detail detent here,
    // like iOS's `selectedDetent = detailDetent` in `flyToSelectedPlace`.
    sheetRef.current?.snapToIndex(1);
    camera.setMode('3d');
    camera.flyTo({ latitude: pick.latitude, longitude: pick.longitude });
  }

  function handleSelectResult(place: PlacePrediction) {
    const source: LocationPick['source'] = searchQuery.trim().length === 0 ? 'suggested' : 'search';
    selectPlace(pickFromPrediction(place, source));
  }

  function handleSelectRecent(recent: RecentLocationDto) {
    // `recents` is pre-filtered to `selectableRecents` before it reaches the sheet, so this
    // should always hold — the guard just keeps `pickFromRecent`'s stricter param type honest
    // without an unsafe cast.
    if (typeof recent.latitude !== 'number' || typeof recent.longitude !== 'number') return;
    selectPlace(
      pickFromRecent({ ...recent, latitude: recent.latitude, longitude: recent.longitude }),
    );
  }

  function handleMapPick(pick: LocationPick) {
    selectPlace(pick);
  }

  /** In detail, touching the map (tap or drag) flattens the camera to 2D and stops the orbit so
   * the user can pan around and tap another POI. The sheet keeps its height. A tap also clears
   * the callout; picking a place resumes the 3D orbit (`selectPlace`). */
  function flattenDetailMap() {
    if (sheetContent !== 'detail' || directions.active || camera.mode === '2d') return;
    camera.setMode('2d');
  }

  function handleMapPress() {
    // Backstop to `LocationMap`'s press/POI disambiguation: a picked place must stay in 3D with
    // its callout, never be flattened by the tail of the tap that picked it.
    if (Date.now() - lastSelectAtRef.current < 1000) return;
    setCalloutVisible(false);
    flattenDetailMap();
  }

  function handleBack() {
    setCalloutVisible(false);
    setSheetContent('search');
  }

  /** Map back chevron — `LocationDetailView.handleBackButton()`: in picker detail it returns to
   * search; otherwise it dismisses the whole screen. */
  function handleHeaderBack() {
    if (mode === 'pick' && sheetContent === 'detail' && !directions.active) {
      handleBack();
      return;
    }
    router.back();
  }

  function handleAddToPlan() {
    if (!displayedPlace) return;
    useLocationPickStore.getState().set({
      name: displayedPlace.name,
      address: displayedPlace.address,
      latitude: displayedPlace.latitude,
      longitude: displayedPlace.longitude,
      category: displayedPlace.category,
      source: displayedPlace.source,
    });
    router.back();
  }

  function handleSheetIndexChange(index: number) {
    // -1 = closed: directions mode closes the sheet, and gorhom can deliver that change through a
    // stale handler where `directions.active` is still false — it must not restart the orbit.
    if (index < 0 || directions.active || sheetContent !== 'detail') return;
    // Peek detent (index 0 of the detail snap points) flattens to 2D; expanded resumes the orbit.
    camera.setMode(index === 0 ? '2d' : '3d');
  }

  function handleCompassPress() {
    if (!userCoords || !placeLatLng) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    directions.start();
    camera.setMode('directions');
    // Hide the detail sheet like iOS (`isSheetPresented = false`): left docked, it renders above
    // the directions overlay and swallows taps on its Close / mode / Google Maps controls.
    sheetRef.current?.close();
    const model = directionsModel(userCoords, placeLatLng, directions.mode, locale, t);
    if (!model) return;
    const target = directionsCamera(userCoords, placeLatLng, model.cameraDistanceM, windowHeight);
    // Far destinations snap (iOS `shouldAnimateDirectionsFly`); otherwise the 0.35s fly.
    if (model.flySnap) mapRef.current?.setCamera(target);
    else mapRef.current?.animateCamera(target, { duration: 350 });
  }

  function handleCameraMove() {
    void mapRef.current
      ?.getCamera()
      .then((current) => {
        mapHeading.set(current.heading);
        const heading = ((current.heading % 360) + 360) % 360;
        setMapOffNorth(Math.min(heading, 360 - heading) > 1 || current.pitch > 1);
      })
      .catch(() => undefined);
  }

  function handleCloseDirections() {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    directions.stop();
    camera.setMode('3d');
    sheetRef.current?.snapToIndex(DETAIL_RESTING_INDEX);
    if (placeLatLng) camera.flyTo(placeLatLng);
  }

  return (
    <View style={styles.root}>
      <LocationMap
        mapRef={mapRef}
        place={placeLatLng}
        // iOS suppresses the pin in picker search (no place chosen) and in directions mode.
        showPin={!directions.active && !(mode === 'pick' && sheetContent === 'search')}
        placeName={displayedPlace?.name ?? null}
        calloutName={
          displayedPlace && (directions.active || (calloutVisible && sheetContent === 'detail'))
            ? displayedPlace.name
            : null
        }
        calloutCategory={displayedPlace?.category ?? null}
        initialRegion={initialRegion}
        onPress={handleMapPress}
        onPanDrag={flattenDetailMap}
        onCameraMove={handleCameraMove}
        onMapPick={handleMapPick}
        droppedPinName={t('Dropped pin')}
      >
        {directions.active && directions.model ? (
          <DirectionsPolyline points={directions.model.points} />
        ) : null}
      </LocationMap>

      {/* In directions the back chevron returns to the place's default (detail) view. */}
      <LocationHeader onBack={directions.active ? handleCloseDirections : handleHeaderBack} />

      {sheetContent === 'detail' && !directions.active && placeLatLng ? (
        <Animated.View style={[styles.compass, compassStyle]} pointerEvents="box-none">
          <CompassPill
            userCoords={userCoords}
            place={placeLatLng}
            deviceHeading={deviceHeading}
            onPress={handleCompassPress}
            testID="compass-pill"
          />
        </Animated.View>
      ) : null}

      {directions.active && directions.model && placeLatLng ? (
        // The animated view is the conditional root itself: a layout-animated child removed along
        // with a plain parent can leave its exiting snapshot stranded on screen.
        <Animated.View
          entering={directionsEntering}
          exiting={directionsExiting}
          style={[styles.directionsOverlay, { paddingBottom: insets.bottom + 12 }]}
          pointerEvents="box-none"
        >
          <View onLayout={(event) => setDirectionsCardHeight(event.nativeEvent.layout.height)}>
            <DirectionsOverlay
              minutes={directions.model.minutes}
              mode={directions.mode}
              onMode={directions.setMode}
              onClose={handleCloseDirections}
              destination={placeLatLng}
              name={displayedPlace?.name ?? ''}
              testID="location-directions"
            />
          </View>
        </Animated.View>
      ) : null}

      {!directions.active && sheetContent === 'search' ? (
        <PoweredBy attribution={provider.attribution} testID="location-powered-by" />
      ) : null}

      <LocationSheet
        ref={sheetRef}
        content={sheetContent}
        mode={mode}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        results={search.results}
        recents={selectableRecents(recents.data ?? [])}
        suggested={suggested}
        showSuggested={userCoords != null}
        onBoardPick={
          mode === 'pick'
            ? (pin) => {
                if (pin.latitude === undefined || pin.longitude === undefined) return;
                useLocationPickStore.getState().set({
                  name: pin.name,
                  latitude: pin.latitude,
                  longitude: pin.longitude,
                  address: pin.address ?? null,
                  category: pin.category ?? null,
                  source: 'board',
                });
                router.back();
              }
            : undefined
        }
        onBoardBulk={
          mode === 'pick' && !!params.tripId
            ? async (pins) => {
                if (bulkBusy.current || !me.data || !requireOnline(t)) return;
                const tripId = Number(params.tripId);
                if (!Number.isSafeInteger(tripId) || tripId <= 0) return;
                boardPickStore.set(tripId, pins);
                const picked = boardPickStore.consume(tripId);
                if (!picked) return;
                if (
                  !bulkProgress.current ||
                  JSON.stringify(bulkProgress.current.pins) !== JSON.stringify(picked)
                )
                  bulkProgress.current = { pins: picked, saved: 0 };
                bulkBusy.current = true;
                try {
                  const items = pinPlanItems(picked, me.data.id);
                  for (let i = bulkProgress.current.saved; i < items.length; i++) {
                    await createPlanItem(tripId, items[i]!);
                    bulkProgress.current.saved = i + 1;
                  }
                  router.dismissTo({ pathname: '/trip/[tripId]', params: { tripId, tab: 'plan' } });
                } catch {
                  Alert.alert(t('Failed to add pins to trip.'));
                } finally {
                  bulkBusy.current = false;
                  void invalidatePlanItems(queryClient, tripId);
                }
              }
            : undefined
        }
        onSelectResult={handleSelectResult}
        onSelectRecent={handleSelectRecent}
        detailPlace={displayedPlace}
        distanceText={distanceText}
        onAddToPlan={handleAddToPlan}
        onIndexChange={handleSheetIndexChange}
        animatedPosition={sheetPosition}
      />

      {userCoords ? (
        <Animated.View style={[styles.locate, locateStyle]} pointerEvents="box-none">
          {mapOffNorth ? (
            <MapCompassButton heading={mapHeading} onPress={camera.resetNorth} />
          ) : null}
          <GlassIconButton
            label={t('My location')}
            icon="locate"
            onPress={() => camera.centerOn(userCoords)}
            testID="location-locate"
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  compass: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  locate: { position: 'absolute', right: 16, gap: 8 },
  directionsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
});
