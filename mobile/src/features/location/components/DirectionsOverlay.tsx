/**
 * In-app directions mode control bar for the location-detail map. Port of
 * `LocationDirectionsControlBar`
 * (`ios/OnePlan/OnePlan/Component/LocationDetail/LocationDirectionsOverlay.swift`): a route strip
 * (car/walk capsule, animated striped "N mins by foot" pill, ring collapse button) above a
 * "Direction" section of open-in-maps buttons. iOS renders no top label in directions mode
 * (`LocationDirectionsTopLabel` is preview-only), so neither does this.
 *
 * The map-layer route line is NOT drawn here — `DirectionsPolyline` below is a
 * standalone `react-native-maps` child the screen places inside its `MapView`.
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, PixelRatio, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Polyline } from 'react-native-maps';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { openDirections } from '@/features/plan/helpers/openInMaps';
import type { LatLng, TransportMode } from '@/features/plan/helpers/geo';
import { useAppLanguage } from '@/i18n';
import { images, svg } from '@/ui/assets';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface DirectionsOverlayProps {
  minutes: number;
  mode: TransportMode;
  onMode: (mode: TransportMode) => void;
  onClose: () => void;
  destination: LatLng;
  name: string;
  testID?: string;
}

/** iOS order: driving, then walking. */
const MODES: readonly { value: TransportMode; icon: 'car' | 'walk' }[] = [
  { value: 'car', icon: 'car' },
  { value: 'walk', icon: 'walk' },
];

const STRIP_HEIGHT = 32;
const TOGGLE_WIDTH = 97;
/** `Color(red: 0.85, green: 0.92, blue: 1)` / stripe `Color(red: 0.8, green: 0.89, blue: 1)`. */
const STRIP_FILL = 'rgb(217, 235, 255)';
const STRIPE_FILL = 'rgb(204, 227, 255)';
/** Collapse button inner dot — `Color(red: 0.38, green: 0.55, blue: 1)`. */
const COLLAPSE_DOT = 'rgb(97, 140, 255)';

export function DirectionsOverlay({
  minutes,
  mode,
  onMode,
  onClose,
  destination,
  name,
  testID,
}: DirectionsOverlayProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const GoogleMapsIcon = svg.icons.googleMaps;
  const [stripWidth, setStripWidth] = useState(0);

  return (
    <View style={styles.card} testID={testID}>
      <View
        style={styles.strip}
        onLayout={(event) => setStripWidth(event.nativeEvent.layout.width)}
      >
        <View style={styles.stripPill}>
          <DiagonalStripes width={stripWidth} />
        </View>

        <Text
          style={[styles.routeText, { width: Math.max(0, stripWidth - 129) }]}
          numberOfLines={1}
        >
          <Text style={styles.routeMinutes}>{`${minutes} mins`}</Text>
          {` ${mode === 'walk' ? t('by foot') : t('by car')}`}
        </Text>

        <View style={styles.toggle} testID={testID ? `${testID}-mode` : undefined}>
          {MODES.map((option) => {
            const selected = option.value === mode;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onMode(option.value)}
                testID={testID ? `${testID}-mode-${option.value}` : undefined}
                style={[styles.segment, selected && styles.segmentSelected]}
              >
                <Ionicons
                  name={option.icon}
                  size={18}
                  color={selected ? colors.white : colors.contentM}
                />
              </Pressable>
            );
          })}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Close')}
          onPress={onClose}
          testID={testID ? `${testID}-close` : undefined}
          style={styles.collapse}
        >
          <View style={styles.collapseRing} />
          <View style={styles.collapseDot} />
        </Pressable>
      </View>

      <View style={styles.directionSection}>
        <Text style={styles.directionLabel}>{t('Direction')}</Text>
        <View style={styles.mapButtons}>
          {Platform.OS === 'ios' ? (
            <MapButton
              title={t('Apple map')}
              icon={<Image source={images.appleMap} style={styles.appleMapIcon} />}
              onPress={() => void openDirections({ destination, mode, name }, 'apple', t)}
              testID={testID ? `${testID}-apple` : undefined}
            />
          ) : null}
          <MapButton
            title={t('Google map')}
            icon={<GoogleMapsIcon width={23} height={23} />}
            onPress={() => void openDirections({ destination, mode, name }, 'google', t)}
            testID={testID ? `${testID}-google` : undefined}
          />
        </View>
      </View>
    </View>
  );
}

function MapButton({
  title,
  icon,
  onPress,
  testID,
}: {
  title: string;
  icon: ReactNode;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={testID}
      style={styles.mapButton}
    >
      <View style={styles.mapButtonIcon}>{icon}</View>
      <Text style={styles.mapButtonLabel} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

/** `DiagonalRouteStripes`: 9×74 bars rotated 43°, 11pt apart, drifting 20pt every 1.2s. */
function DiagonalStripes({ width }: { width: number }) {
  const reduceMotion = useReducedMotion();
  const phase = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    phase.value = 0;
    phase.value = withRepeat(withTiming(20, { duration: 1200, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(phase);
  }, [phase, reduceMotion]);

  const driftStyle = useAnimatedStyle(() => ({ transform: [{ translateX: phase.value }] }));
  const count = Math.floor(width / 20) + 4;

  return (
    <Animated.View style={[styles.stripes, driftStyle]} pointerEvents="none">
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={styles.stripe} />
      ))}
    </Animated.View>
  );
}

/** iOS `StrokeStyle(dash: [8, 6])`, in points. */
const ROUTE_DASH_PT = [8, 6];

/** Dashed route line for the directions map layer — placed as a `MapView` child. */
export function DirectionsPolyline({ points }: { points: LatLng[] }) {
  return (
    <Polyline
      coordinates={points}
      strokeColor={colors.blueBase}
      strokeWidth={1}
      // Android quirks in react-native-maps: a round cap (its default) swaps every dash for a dot,
      // and `lineDashPattern` is raw pixels while `strokeWidth` is density-scaled. Butt caps and a
      // pixel-scaled pattern give iOS's 8pt/6pt dashes.
      lineCap={Platform.OS === 'android' ? 'butt' : 'round'}
      lineDashPattern={
        Platform.OS === 'android'
          ? ROUTE_DASH_PT.map((pt) => PixelRatio.getPixelSizeForLayoutSize(pt))
          : ROUTE_DASH_PT
      }
    />
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 16,
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 12,
    borderRadius: 36,
    backgroundColor: colors.white,
  },
  strip: { height: STRIP_HEIGHT, justifyContent: 'center' },
  stripPill: {
    position: 'absolute',
    top: 1,
    bottom: 1,
    left: 0,
    right: 0,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: STRIP_FILL,
  },
  stripes: {
    position: 'absolute',
    left: -44,
    top: -25,
    flexDirection: 'row',
    gap: 11,
  },
  stripe: {
    width: 9,
    height: 74,
    backgroundColor: STRIPE_FILL,
    transform: [{ rotate: '43deg' }],
  },
  routeText: {
    position: 'absolute',
    left: TOGGLE_WIDTH,
    textAlign: 'center',
    letterSpacing: -0.28,
    ...beVietnamPro(14, 'medium'),
    color: colors.contentB,
  },
  routeMinutes: { ...beVietnamPro(14, 'semibold'), color: colors.blueBase },
  toggle: {
    position: 'absolute',
    left: 0,
    width: TOGGLE_WIDTH,
    height: STRIP_HEIGHT,
    flexDirection: 'row',
    borderRadius: STRIP_HEIGHT / 2,
    borderWidth: 2,
    borderColor: colors.blueBase,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: STRIP_HEIGHT / 2,
  },
  segmentSelected: { backgroundColor: colors.blueBase },
  collapse: {
    position: 'absolute',
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  collapseRing: {
    position: 'absolute',
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.blueBase,
  },
  collapseDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLLAPSE_DOT },
  directionSection: {
    gap: 6,
    padding: 6,
    borderRadius: 16,
    backgroundColor: colors.neutral50,
  },
  directionLabel: {
    paddingTop: 4,
    paddingHorizontal: 4,
    letterSpacing: -0.28,
    ...beVietnamPro(14, 'regular'),
    color: colors.contentB,
  },
  mapButtons: { flexDirection: 'row', gap: 8 },
  mapButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.white,
  },
  mapButtonIcon: {
    width: 23,
    height: 23,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  /** iOS: `scaledToFill` into 30×30, clipped to the 23pt icon frame. */
  appleMapIcon: { width: 30, height: 30, resizeMode: 'cover' },
  mapButtonLabel: {
    flex: 1,
    letterSpacing: -0.3,
    ...beVietnamPro(15, 'regular'),
    color: colors.contentB,
  },
});
