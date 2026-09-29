import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

export interface MarkerStripProps {
  /** `animated` loops (PassportCard `.full`); `static` renders one fixed row (ImageRenderer export). */
  variant?: 'animated' | 'static';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Port of `PassportCard.swift`'s 16-colour `markerColors`, RGB-float → rounded hex. */
export const MARKER_COLORS: readonly string[] = [
  '#F2C740',
  '#F2C740',
  '#EDD94D',
  '#D9DE4D',
  '#BDDB45',
  '#BDDB45',
  '#9ED642',
  '#85D145',
  '#6BC74D',
  '#6BC74D',
  '#8CD445',
  '#ABD945',
  '#CCDB47',
  '#E8D447',
  '#F2C740',
  '#A6E854',
];

const SYMBOL_WIDTH = 13;
const SYMBOL_SPACING = 6;
/** Total width of one un-repeated strip, incl. trailing spacing before the loop repeats. */
const CYCLE_WIDTH =
  MARKER_COLORS.length * SYMBOL_WIDTH +
  Math.max(MARKER_COLORS.length - 1, 0) * SYMBOL_SPACING +
  SYMBOL_SPACING;
/** iOS `elapsed * 24` px/sec. */
const SPEED_PX_PER_SEC = 24;
const LOOP_DURATION_MS = (CYCLE_WIDTH / SPEED_PX_PER_SEC) * 1000;

function MarkerRow({ testID }: { testID?: string }) {
  return (
    <View style={styles.row} testID={testID}>
      {MARKER_COLORS.map((color, index) => (
        <Ionicons key={index} name="airplane" size={12} color={color} style={styles.icon} />
      ))}
    </View>
  );
}

/** Port of `PassportCard.swift`'s `animatedMarkerStrip` / `staticMarkerStrip`. */
export function MarkerStrip({ variant = 'animated', style, testID }: MarkerStripProps) {
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(0);
  const shouldAnimate = variant === 'animated' && !reduceMotion;
  // Seamless loop needs copies spanning container width + one cycle; the card is wider than a
  // single cycle, so two copies leave an empty tail that snaps in when the loop restarts.
  const [copies, setCopies] = useState(3);

  useEffect(() => {
    if (!shouldAnimate) {
      cancelAnimation(offset);
      offset.value = 0;
      return;
    }
    // iOS scrolls -cycle → 0 (rightward), so the right-pointing planes fly forward.
    offset.value = -CYCLE_WIDTH;
    offset.value = withRepeat(
      withTiming(0, { duration: LOOP_DURATION_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(offset);
  }, [shouldAnimate, offset]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  if (variant === 'static') {
    return (
      <View style={[styles.container, style]} testID={testID}>
        <MarkerRow testID={testID ? `${testID}-row` : undefined} />
      </View>
    );
  }

  return (
    <View
      style={[styles.container, style]}
      testID={testID}
      onLayout={(e) => {
        const needed = Math.max(2, Math.ceil(e.nativeEvent.layout.width / CYCLE_WIDTH) + 1);
        if (needed !== copies) setCopies(needed);
      }}
    >
      <Animated.View style={[styles.loopRow, animatedStyle]}>
        {Array.from({ length: copies }, (_, i) => (
          <MarkerRow
            key={i}
            testID={testID ? (i === 0 ? `${testID}-row` : `${testID}-row-${i + 1}`) : undefined}
          />
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 16, overflow: 'hidden' },
  loopRow: { flexDirection: 'row', gap: SYMBOL_SPACING },
  row: { flexDirection: 'row', gap: SYMBOL_SPACING },
  icon: { width: SYMBOL_WIDTH },
});
