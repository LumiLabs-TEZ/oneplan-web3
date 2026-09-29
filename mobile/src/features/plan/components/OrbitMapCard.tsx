/**
 * Non-interactive orbiting mini map — a slowly rotating 3D preview centered on
 * a single pin. Ports `PlanDetailMapPreview`
 * (`ios/OnePlan/OnePlan/View/Plan/PlanDetailView.swift:591-640`): distance 900,
 * pitch 58, heading advancing +1°/0.12 s, no user interaction. The orbit only
 * runs while the screen is focused, mirroring the iOS pause/resume behavior
 * in `LocationDetailView.swift:128-132,666-700`.
 */
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, type StyleProp, Text, View, type ViewStyle } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { MapUnavailable } from '@/native/maps/MapUnavailable';
import { isMapAvailable, mapProvider, MAP_DEFAULTS } from '@/native/maps/provider';
import { useOrbitCamera } from '@/native/maps/useOrbitCamera';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import type { LatLng } from '../helpers/geo';

export interface OrbitMapCardProps {
  center: LatLng;
  title?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function OrbitMapCard({ center, title, height = 120, style, testID }: OrbitMapCardProps) {
  const mapRef = useRef<MapView>(null);
  const [isFocused, setIsFocused] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  useOrbitCamera(mapRef, {
    center,
    enabled: isFocused,
    pitch: MAP_DEFAULTS.pitch3D,
    stepDeg: MAP_DEFAULTS.orbitStepDeg,
    intervalMs: MAP_DEFAULTS.orbitIntervalMs,
  });

  return (
    <View style={[styles.card, { height }, style]} testID={testID}>
      {title ? (
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      ) : null}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {isMapAvailable() ? (
          <MapView
            initialCamera={{
              center,
              pitch: MAP_DEFAULTS.pitch3D,
              heading: 0,
              zoom: MAP_DEFAULTS.zoom3D,
            }}
            pitchEnabled={false}
            provider={mapProvider()}
            ref={mapRef}
            rotateEnabled={false}
            scrollEnabled={false}
            style={StyleSheet.absoluteFill}
            zoomEnabled={false}
          >
            <Marker coordinate={center} />
          </MapView>
        ) : (
          <MapUnavailable style={StyleSheet.absoluteFill} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  title: {
    ...beVietnamPro(14, 'medium'),
    color: colors.white,
    position: 'absolute',
    top: 8,
    left: 12,
    zIndex: 1,
  },
});
