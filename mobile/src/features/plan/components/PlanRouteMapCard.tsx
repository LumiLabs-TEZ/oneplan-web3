/**
 * Non-interactive map preview card for a day's route — header ported from
 * `TodaysActivitiesCard.tsx:43-64` (`'%lld pins'` / `'View details'`), body
 * swaps the plain list for an actual `MapView` (Phase 6 in the iOS port).
 * The map itself never receives touches (`pointerEvents="none"` + all gesture
 * props disabled) — a full-bleed `Pressable` overlay forwards taps to
 * `onViewDetails` so the whole card behaves as one button.
 */
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, type StyleProp, Text, View, type ViewStyle } from 'react-native';
import MapView from 'react-native-maps';

import { useAppLanguage } from '@/i18n';
import { isMapAvailable, mapProvider } from '@/native/maps/provider';
import { MapUnavailable } from '@/native/maps/MapUnavailable';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { RouteLayer } from './RouteLayer';
import { fittedRegion, type Region } from '../helpers/geo';
import type { DayPin } from '../helpers/planDays';
import type { DayRouteLeg } from '../hooks/useDayRoute';

export interface PlanRouteMapCardProps {
  title: string;
  pins: readonly DayPin[];
  legs: readonly DayRouteLeg[];
  onViewDetails?: () => void;
  onPinPress?: (pin: DayPin) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function PlanRouteMapCard({
  title,
  pins,
  legs,
  onViewDetails,
  onPinPress,
  style,
  testID,
}: PlanRouteMapCardProps) {
  useAppLanguage();
  const { t } = useTranslation();

  if (pins.length === 0) return null;

  const initialRegion: Region = fittedRegion(pins);

  return (
    <View style={[styles.card, style]} testID={testID}>
      <View style={styles.header}>
        <Image
          source={require('@/assets/images/illustration/signpost.png')}
          style={styles.illustration}
          contentFit="cover"
        />
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {t('%lld pins', { count: pins.length })}
          </Text>
        </View>
        {onViewDetails ? (
          <Pressable
            accessibilityRole="button"
            onPress={onViewDetails}
            style={styles.viewDetails}
            testID="plan-route-map-card-view-details"
          >
            <Text style={styles.viewDetailsText} numberOfLines={1}>
              {t('View details')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.mapWrapper}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {isMapAvailable() ? (
            <MapView
              initialRegion={initialRegion}
              pitchEnabled={false}
              provider={mapProvider()}
              rotateEnabled={false}
              scrollEnabled={false}
              style={StyleSheet.absoluteFill}
              zoomEnabled={false}
            >
              <RouteLayer legs={legs} onPinPress={onPinPress} pins={pins} />
            </MapView>
          ) : (
            <MapUnavailable style={StyleSheet.absoluteFill} />
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onViewDetails}
          style={StyleSheet.absoluteFill}
          testID="plan-route-map-card"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 8,
    gap: 8,
    borderRadius: 24,
    backgroundColor: colors.surface,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  illustration: { width: 54, height: 54, borderRadius: 12 },
  headerText: { flex: 1, gap: 4 },
  title: { ...beVietnamPro(16), color: colors.contentB, letterSpacing: -0.32 },
  subtitle: { ...beVietnamPro(14), color: colors.contentM, letterSpacing: -0.28 },
  viewDetails: {
    height: 42,
    paddingHorizontal: 20,
    borderRadius: 21,
    backgroundColor: colors.blueBase,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewDetailsText: { ...beVietnamPro(15, 'medium'), color: colors.white },
  mapWrapper: {
    height: 183,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
});
