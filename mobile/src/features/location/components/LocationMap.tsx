/**
 * Full-screen map for the location-detail screen: Google tiles (`mapProvider`), user
 * location + POIs on, a blue pin for the displayed place with an optional "name / Recently
 * Viewed" callout above it, and long-press/POI-tap → reverse geocode → a `{ source: 'map' }`
 * pick. Port of the map layer in `LocationDetailView`
 * (`ios/OnePlan/OnePlan/View/LocationDetailView.swift:150-232, 360-560`).
 */
import * as Location from 'expo-location';
import { type ReactNode, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import MapView, {
  Marker,
  type LongPressEvent,
  type PoiClickEvent,
  type Region,
} from 'react-native-maps';

import type { LatLng } from '@/features/plan/helpers/geo';
import { matchedCategoryIllustrationKey } from '@/features/location/helpers/categoryIllustration';
import type { LocationPick } from '@/features/location/types';
import { MapUnavailable } from '@/native/maps/MapUnavailable';
import { isMapAvailable, mapProvider } from '@/native/maps/provider';
import { useAppLanguage } from '@/i18n';
import { svg } from '@/ui/assets';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface LocationMapProps {
  mapRef: React.RefObject<MapView | null>;
  place: LatLng | null;
  /** Hides the pin (directions mode draws its own route to the destination). */
  showPin?: boolean;
  /** Label under the pin — iOS `Marker(displayedName, …)`. */
  placeName?: string | null;
  /** Callout card above the place — iOS's selected-POI / directions-destination annotation. */
  calloutName?: string | null;
  /** Free-text POI category for the callout's artwork; unknown/`null` → app logo. */
  calloutCategory?: string | null;
  initialRegion: Region;
  /** Plain map tap (not a POI) — iOS clears the callout on tap. */
  onPress?: () => void;
  /** Fires continuously while the user pans the map. */
  onPanDrag?: () => void;
  /** Fires on every camera move — gestures and programmatic animations (e.g. the orbit). */
  onCameraMove?: () => void;
  onMapPick: (pick: LocationPick) => void;
  /** Localized fallback name for a long-pressed / reverse-geocode-less pin (`t('Dropped pin')`). */
  droppedPinName: string;
  children?: ReactNode;
}

async function reverseGeocodeToPick(
  coord: LatLng,
  droppedPinName: string,
  fallbackName?: string,
): Promise<LocationPick> {
  try {
    const [result] = await Location.reverseGeocodeAsync(coord);
    const name = fallbackName || result?.name || result?.street || droppedPinName;
    const addressParts = [result?.street, result?.city, result?.region].filter(
      (part): part is string => !!part,
    );
    return {
      name,
      address: addressParts.length > 0 ? addressParts.join(', ') : null,
      latitude: coord.latitude,
      longitude: coord.longitude,
      category: null,
      source: 'map',
    };
  } catch {
    return {
      name: fallbackName || droppedPinName,
      address: null,
      latitude: coord.latitude,
      longitude: coord.longitude,
      category: null,
      source: 'map',
    };
  }
}

/** One tap on a POI can fire both the map's `onPress` and `onPoiClick`, in either order and up to
 * a few hundred ms apart (the SDK waits out its double-tap-to-zoom before reporting the
 * selection). A plain press is therefore held this long so a following POI tap can claim it… */
const PRESS_POI_GRACE_MS = 500;
/** …and any press arriving this soon after a POI tap is treated as part of that tap. Without both,
 * the plain-tap response (hide callout + flatten to 2D) could land after the POI selection and
 * leave the new place stuck in 2D. */
const POI_CLAIMS_PRESS_MS = 1000;

/** SwiftUI `.blue` — iOS tints both the `Marker` and the callout title with it. */
const SYSTEM_BLUE = '#007AFF';
/** Lift the callout just enough above the pin head to keep the pin visible. */
const PIN_CLEARANCE = 16;

function PlaceCallout({ name, category }: { name: string; category: string | null }) {
  useAppLanguage();
  const { t } = useTranslation();
  const key = matchedCategoryIllustrationKey(category);
  const Logo = key ? svg.categories[key] : svg.illustration.appLogoCutout;
  return (
    <View style={styles.callout} pointerEvents="none">
      <View style={styles.calloutCard}>
        <View style={styles.calloutArt}>
          <Logo width={40} height={40} preserveAspectRatio="xMidYMid slice" />
        </View>
        <View style={styles.calloutText}>
          <Text style={styles.calloutName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.calloutSubtitle}>{t('Recently Viewed')}</Text>
        </View>
      </View>
      <View style={styles.calloutDot} />
    </View>
  );
}

export function LocationMap({
  mapRef,
  place,
  showPin = true,
  placeName,
  calloutName,
  calloutCategory = null,
  initialRegion,
  onPress,
  onPanDrag,
  onCameraMove,
  onMapPick,
  droppedPinName,
  children,
}: LocationMapProps) {
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPoiAtRef = useRef(0);

  const clearPressTimer = () => {
    if (pressTimerRef.current !== null) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  useEffect(() => clearPressTimer, []);

  const handlePress = () => {
    if (!onPress) return;
    if (Date.now() - lastPoiAtRef.current < POI_CLAIMS_PRESS_MS) return;
    clearPressTimer();
    pressTimerRef.current = setTimeout(() => {
      pressTimerRef.current = null;
      onPress();
    }, PRESS_POI_GRACE_MS);
  };

  const handleLongPress = (event: LongPressEvent) => {
    void reverseGeocodeToPick(event.nativeEvent.coordinate, droppedPinName).then(onMapPick);
  };

  const handlePoiClick = (event: PoiClickEvent) => {
    lastPoiAtRef.current = Date.now();
    clearPressTimer();
    void reverseGeocodeToPick(
      event.nativeEvent.coordinate,
      droppedPinName,
      event.nativeEvent.name,
    ).then(onMapPick);
  };

  if (!isMapAvailable()) return <MapUnavailable style={StyleSheet.absoluteFill} />;

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      provider={mapProvider()}
      initialRegion={initialRegion}
      showsUserLocation
      // Our own locate button floats above the sheet (`LocationScreen`); Google's sits under the status bar.
      showsMyLocationButton={false}
      // Likewise the compass: Android pins Google's under the status bar; ours stacks on locate.
      showsCompass={false}
      onRegionChange={onCameraMove ? () => onCameraMove() : undefined}
      showsPointsOfInterests
      onPress={onPress ? handlePress : undefined}
      onPanDrag={onPanDrag ? () => onPanDrag() : undefined}
      onLongPress={handleLongPress}
      onPoiClick={handlePoiClick}
      testID="location-map"
    >
      {place && showPin ? (
        <Marker
          coordinate={place}
          title={placeName ?? undefined}
          pinColor={SYSTEM_BLUE}
          testID="location-pin"
        />
      ) : null}
      {place && calloutName ? (
        <Marker
          coordinate={place}
          // Bottom-anchored so the dot lands just above the pin head.
          anchor={{ x: 0.5, y: 1 }}
          zIndex={2}
          testID="location-callout"
        >
          <View style={showPin ? styles.pinClearance : null}>
            <PlaceCallout name={calloutName} category={calloutCategory} />
          </View>
        </Marker>
      ) : null}
      {children}
    </MapView>
  );
}

const styles = StyleSheet.create({
  callout: { alignItems: 'center' },
  calloutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.white,
    boxShadow: '0px 2px 8px rgba(0,0,0,0.10)',
  },
  calloutArt: { width: 40, height: 40, borderRadius: 8, overflow: 'hidden' },
  calloutText: { gap: 2, maxWidth: 220 },
  calloutName: { ...beVietnamPro(16, 'semibold'), color: SYSTEM_BLUE },
  calloutSubtitle: { ...beVietnamPro(13), color: colors.contentB },
  calloutDot: {
    width: 8,
    height: 8,
    marginTop: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  pinClearance: { paddingBottom: PIN_CLEARANCE },
});
