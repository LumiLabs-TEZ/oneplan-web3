/**
 * A car (or walker, on walked legs) badge that travels the selected stop's highlighted leg on the day map in a
 * loop (`travelerPath` — empty, so nothing renders, when no stop is selected). At the
 * destination it disappears for a beat and a new badge starts again at A.
 * Round and non-rotating, so it reads correctly at any heading without redrawing the
 * marker bitmap every frame. Hidden under the OS "Reduce Motion" setting.
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { useReducedMotion } from 'react-native-reanimated';

import { colors } from '@/ui/theme';

import { cumulativeMeters, pointAlongPath, type LatLng } from '../helpers/geo';

/** Hold at the destination before looping back to the start. */
const END_PAUSE_MS = 600;
/** ~30 fps is smooth for a map marker and halves the bridge traffic of 60. */
const FRAME_MS = 33;

export interface RouteTravelerProps {
  points: readonly LatLng[];
  /** Time to drive the whole path once (the end pause comes on top). */
  durationMs: number;
  /** Walker badge on walked legs, car badge on driven ones. */
  mode?: 'walk' | 'drive';
  testID?: string;
}

function pathKey(points: readonly LatLng[]): string {
  const first = points[0];
  const last = points[points.length - 1];
  return first && last
    ? `${points.length}:${first.latitude},${first.longitude}:${last.latitude},${last.longitude}`
    : '';
}

export function RouteTraveler({ points, durationMs, mode = 'drive', testID }: RouteTravelerProps) {
  const reducedMotion = useReducedMotion();
  // `null` while hidden (the pause at the destination); `lap` counts loops so each one mounts
  // a brand-new marker at the start — reusing one would visibly fly it back from B to A.
  const [position, setPosition] = useState<{ lap: number; coordinate: LatLng } | null>(null);

  // `points` is rebuilt by the caller on every render — restart the loop only when the path
  // itself changes.
  const key = pathKey(points);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands in for `points`
  const path = useMemo(() => [...points], [key]);
  const animate = !reducedMotion && path.length >= 2;

  useEffect(() => {
    if (!animate) return;
    const cumulative = cumulativeMeters(path);
    const cycleMs = durationMs + END_PAUSE_MS;
    let frame = 0;
    let start: number | null = null;
    let lastPaint = -Infinity;
    const tick = (now: number) => {
      start ??= now;
      if (now - lastPaint >= FRAME_MS) {
        lastPaint = now;
        const lap = Math.floor((now - start) / cycleMs);
        const elapsed = (now - start) % cycleMs;
        setPosition(
          elapsed > durationMs
            ? null
            : { lap, coordinate: pointAlongPath(path, cumulative, elapsed / durationMs) },
        );
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      setPosition(null);
    };
  }, [animate, path, durationMs]);

  if (!animate || !position) return null;

  return (
    <TravelerMarker
      // New lap, new path, or walk ↔ drive → a fresh marker (and a fresh bitmap snapshot).
      key={`${key}:${position.lap}:${mode}`}
      coordinate={position.coordinate}
      mode={mode}
      testID={testID}
    />
  );
}

function TravelerMarker({
  coordinate,
  mode,
  testID,
}: {
  coordinate: LatLng;
  mode: 'walk' | 'drive';
  testID?: string;
}) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  return (
    <Marker
      anchor={{ x: 0.5, y: 0.5 }}
      coordinate={coordinate}
      tracksViewChanges={tracksViewChanges}
      tappable={false}
      zIndex={1}
      testID={testID}
    >
      <View style={styles.frame} onLayout={() => setTracksViewChanges(false)}>
        <View style={styles.badge}>
          <Ionicons name={mode === 'walk' ? 'walk' : 'car'} size={14} color={colors.blueBase} />
        </View>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  // Room around the badge so its shadow isn't clipped by the marker bitmap.
  frame: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.blueBase,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 1px 3px rgba(0,0,0,0.25)',
  },
});
