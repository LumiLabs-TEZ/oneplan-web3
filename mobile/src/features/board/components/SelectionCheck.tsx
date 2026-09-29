import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '@/ui/theme';

/**
 * 0→1 selection progress eased like SwiftUI's `withAnimation(.easeInOut(duration: 0.18))`
 * (`TripVibeBottomSheet` / `GenerateTripBottomSheet` `select`). Starts at the current value so
 * the first render never animates.
 */
export function useSelectionProgress(selected: boolean): SharedValue<number> {
  const reduced = useReducedMotion();
  const progress = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(selected ? 1 : 0, {
      duration: reduced ? 0 : 180,
      easing: Easing.inOut(Easing.ease),
    });
  }, [selected, reduced, progress]);
  return progress;
}

/**
 * Round check indicator: fill/stroke cross-fade to blue and the checkmark scales + fades in
 * (SwiftUI `.transition(.scale.combined(with: .opacity))`).
 */
export function SelectionCheck({
  selected,
  size = 22,
  borderWidth = 1,
  iconSize = 15,
  fill = 'transparent',
  stroke = colors.neutral200,
}: {
  selected: boolean;
  size?: number;
  borderWidth?: number;
  iconSize?: number;
  fill?: string;
  stroke?: string;
}) {
  const progress = useSelectionProgress(selected);
  const circle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [fill, colors.blueBase]),
    borderColor: interpolateColor(progress.value, [0, 1], [stroke, colors.blueBase]),
  }));
  const check = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: progress.value }],
  }));
  return (
    <Animated.View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, borderWidth },
        circle,
      ]}
    >
      <Animated.View style={check}>
        <Ionicons name="checkmark" size={iconSize} color={colors.white} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
});
