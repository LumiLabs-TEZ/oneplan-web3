/**
 * Generic two-or-more-option segmented control. Two looks:
 * - `pill` (default): mirrors `Pill` — selected = blueAlpha10 fill + blueBase text — inside a
 *   rounded neutral track (Directions overlay mode picker).
 * - `segmented`: the iOS 26 `Picker(.segmented)` (`TripInsightSection.swift:52-64`) — full-width
 *   gray capsule track, white thumb that slides under the selection, black labels.
 * A light haptic fires only when the selection actually changes.
 */
import * as Haptics from 'expo-haptics';
import { type ReactNode, useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface SegmentedToggleOption<T extends string> {
  value: T;
  label: string;
  /** Optional leading glyph (e.g. an `Ionicons` icon) rendered before `label`. */
  icon?: ReactNode;
}

export interface SegmentedToggleProps<T extends string> {
  options: readonly SegmentedToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: 'pill' | 'segmented';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const TRACK_PADDING = 2;

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  variant = 'pill',
  style,
  testID,
}: SegmentedToggleProps<T>) {
  const reducedMotion = useReducedMotion();
  const [segmentWidth, setSegmentWidth] = useState(0);
  const selectedIndex = Math.max(
    0,
    options.findIndex((opt) => opt.value === value),
  );
  const thumbX = useSharedValue(0);
  useEffect(() => {
    const target = selectedIndex * segmentWidth;
    thumbX.value = reducedMotion ? target : withTiming(target, { duration: 220 });
  }, [selectedIndex, segmentWidth, reducedMotion, thumbX]);
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: thumbX.value }] }));

  const segmented = variant === 'segmented';
  const handleSelect = (next: T) => {
    if (next === value) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onChange(next);
  };

  return (
    <View
      style={[segmented ? styles.segTrack : styles.track, style]}
      accessibilityRole="tablist"
      testID={testID}
      onLayout={
        segmented
          ? (e) =>
              setSegmentWidth(
                (e.nativeEvent.layout.width - TRACK_PADDING * 2) / Math.max(options.length, 1),
              )
          : undefined
      }
    >
      {segmented && segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.segThumb, { width: segmentWidth }, thumbStyle]}
        />
      ) : null}
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => handleSelect(opt.value)}
            style={
              segmented
                ? [
                    styles.segSegment,
                    // Until the track is measured there's no thumb — paint the selection inline.
                    selected && segmentWidth === 0 && styles.segSegmentSelected,
                  ]
                : [styles.segment, selected && styles.segmentSelected]
            }
            testID={testID ? `${testID}-${opt.value}` : undefined}
          >
            <View style={styles.segmentContent}>
              {opt.icon}
              <Text
                style={
                  segmented
                    ? [styles.segLabel, selected && styles.segLabelSelected]
                    : [styles.label, selected && styles.labelSelected]
                }
                numberOfLines={1}
              >
                {opt.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.neutral50,
    borderRadius: radius.pill,
    padding: 3,
    alignSelf: 'flex-start',
  },
  segment: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill,
    backgroundColor: 'transparent',
  },
  segmentSelected: { backgroundColor: colors.blueAlpha10 },
  segmentContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  label: { ...beVietnamPro(14, 'medium'), color: colors.contentM },
  labelSelected: { color: colors.blueBase },
  segTrack: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    height: 36,
    padding: TRACK_PADDING,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(118, 118, 128, 0.12)',
  },
  segThumb: {
    position: 'absolute',
    top: TRACK_PADDING,
    bottom: TRACK_PADDING,
    left: TRACK_PADDING,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.12), 0px 0px 1px rgba(0, 0, 0, 0.08)',
  },
  segSegment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  segSegmentSelected: { backgroundColor: colors.white },
  segLabel: {
    fontFamily: Platform.select({ ios: 'System', default: 'sans-serif-medium' }),
    fontSize: 14,
    fontWeight: '500',
    color: colors.black,
  },
  segLabelSelected: { fontWeight: '600' },
});
