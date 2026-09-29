/**
 * Numbered pin marker for Plan-day maps — 29pt blue circle, 2pt white ring,
 * 1-based index (mirrors `TodaysActivitiesCard.tsx:133-143` / iOS
 * `PlanDayNumberMarker`). `tracksViewChanges` starts `true` (so the custom
 * view rasterizes correctly on first paint) and flips to `false` shortly after
 * mount and after each `selected` change, per the react-native-maps performance guidance.
 */
import { useEffect, useState } from 'react';
import type { LatLng } from 'react-native-maps';
import { Marker } from 'react-native-maps';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface NumberedMarkerProps {
  coordinate: LatLng;
  index: number;
  onPress?: () => void;
  /** Dims the marker (e.g. non-selected pins when another pin is focused). Defaults to `1`. */
  opacity?: number;
  /** Scales the marker up 1.15× (iOS `PlanDayMapView` selected pin). */
  selected?: boolean;
  testID?: string;
}

export function NumberedMarker({
  coordinate,
  index,
  onPress,
  opacity = 1,
  selected = false,
  testID,
}: NumberedMarkerProps) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  const [trackedSelected, setTrackedSelected] = useState(selected);

  // The marker is a rasterized bitmap once tracking stops — re-enable tracking when `selected`
  // flips so the scale change repaints, then turn it off again once it has rendered.
  if (trackedSelected !== selected) {
    setTrackedSelected(selected);
    setTracksViewChanges(true);
  }

  useEffect(() => {
    if (!tracksViewChanges) return;
    const timer = setTimeout(() => setTracksViewChanges(false), 300);
    return () => clearTimeout(timer);
  }, [tracksViewChanges]);

  return (
    <Marker
      anchor={{ x: 0.5, y: 0.5 }}
      coordinate={coordinate}
      onPress={onPress}
      opacity={opacity}
      testID={testID}
      tracksViewChanges={tracksViewChanges}
    >
      <View style={styles.frame}>
        <View style={[styles.marker, selected && styles.markerSelected]}>
          <Text style={styles.markerText}>{index}</Text>
        </View>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  // Room for the 1.15× selected scale so the ring isn't clipped by the marker bitmap.
  frame: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  marker: {
    width: 29,
    height: 29,
    borderRadius: 14.5,
    backgroundColor: colors.blueBase,
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerSelected: { transform: [{ scale: 1.15 }] },
  markerText: { ...beVietnamPro(14, 'semibold'), color: colors.white },
});
