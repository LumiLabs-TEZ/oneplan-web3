/**
 * Compass pill overlaid on the location-detail map: shows distance + a
 * heading-relative needle, tap enters directions mode. Port of
 * `LocationCompassWidget` (`ios/OnePlan/OnePlan/Component/LocationDetail/LocationCompassWidget.swift`).
 * Hidden entirely until a user location fix exists.
 */
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { bearingDegrees, haversineMeters, type LatLng } from '@/features/plan/helpers/geo';
import { useAppLanguage } from '@/i18n';
import { CachedImage } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { formatLocationDistance } from '../helpers/locationDistance';
import { relativeNeedle } from '../hooks/useDeviceHeading';

export interface CompassPillProps {
  userCoords: LatLng | null;
  place: LatLng;
  deviceHeading: number | null;
  onPress: () => void;
  testID?: string;
}

const FACE_SIZE = 32;
const TICK_COUNT = 12;

export function CompassPill({
  userCoords,
  place,
  deviceHeading,
  onPress,
  testID,
}: CompassPillProps) {
  const locale = useAppLanguage();
  const { t } = useTranslation();

  if (!userCoords) return null;

  const distanceM = haversineMeters(userCoords, place);
  const bearing = bearingDegrees(userCoords, place);
  const rotation = relativeNeedle(bearing, deviceHeading ?? 0);
  const distance = formatLocationDistance(distanceM, locale);

  return (
    <Pressable accessibilityRole="button" onPress={onPress} testID={testID}>
      <View style={styles.pill}>
        <View style={styles.face}>
          <CompassTicks />
          <View style={[styles.needleWrap, { transform: [{ rotate: `${rotation}deg` }] }]}>
            {Platform.OS === 'ios' ? (
              <CachedImage
                uri="sf:/location.north.fill"
                contentFit="contain"
                transition={0}
                style={{
                  width: 15,
                  height: 15,
                  fontSize: 11,
                  fontWeight: '700',
                  tintColor: '#007AFF',
                }}
              />
            ) : (
              <Svg width={15} height={15} viewBox="0 0 15 15">
                <Polygon points="7.5,1.5 12,13.5 7.5,10 3,13.5" fill="#007AFF" />
              </Svg>
            )}
          </View>
        </View>
        <View>
          <Text style={styles.distance} numberOfLines={1}>
            {distance}
          </Text>
          <Text style={styles.label} numberOfLines={1}>
            {t('From you')}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function CompassTicks() {
  const radiusPx = FACE_SIZE / 2;
  return (
    <>
      {Array.from({ length: TICK_COUNT }, (_, index) => {
        const isCardinal = index % 3 === 0;
        const angle = index * (360 / TICK_COUNT);
        return (
          <View
            key={index}
            style={[
              styles.tick,
              isCardinal ? styles.tickCardinal : styles.tickMinor,
              {
                transform: [
                  { rotate: `${angle}deg` },
                  { translateY: -(radiusPx - (isCardinal ? 3 : 2)) },
                ],
              },
            ]}
          />
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 40,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingLeft: 4,
    paddingRight: 12,
  },
  face: {
    width: FACE_SIZE,
    height: FACE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  needleWrap: {
    position: 'absolute',
    width: FACE_SIZE,
    height: FACE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: { position: 'absolute', borderRadius: 999 },
  tickCardinal: { width: 1.4, height: 5, backgroundColor: colors.contentB, opacity: 0.8 },
  tickMinor: { width: 1, height: 3, backgroundColor: colors.contentM, opacity: 0.45 },
  distance: { ...beVietnamPro(15, 'heavy'), color: colors.contentB, letterSpacing: -0.3 },
  label: { ...beVietnamPro(10), color: colors.contentM, letterSpacing: -0.2 },
});
