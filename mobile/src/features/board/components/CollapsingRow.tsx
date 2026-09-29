import { type ReactNode, useEffect, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/**
 * List row that fades and collapses its measured height to 0 while `collapsed`, so the rows below
 * slide up into its place; `onCollapsed` fires once fully closed (drop the item from data then).
 * Flipping `collapsed` back re-expands it. Inside recycling lists pass the row's `itemKey` (not a
 * React `key`, which would defeat recycling): when a recycled cell gets a new item the row snaps
 * to that item's state instead of inheriting the previous row's animation.
 */
export function CollapsingRow({
  itemKey,
  collapsed,
  onCollapsed,
  style,
  children,
}: {
  itemKey?: string | number;
  collapsed: boolean;
  onCollapsed: () => void;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const height = useSharedValue(0);
  const progress = useSharedValue(1);
  // The item this cell last animated for, and its collapse request (callback included), so a
  // recycle can settle that item before the cell switches to the next one.
  const shown = useRef({ itemKey, collapsed, onCollapsed });
  useEffect(() => {
    const previous = shown.current;
    shown.current = { itemKey, collapsed, onCollapsed };
    if (previous.itemKey !== itemKey) {
      // Recycled onto another item: stop the previous row's animation (its callback then reports
      // unfinished) and show this row as-is. `height` keeps the cell's last measurement — onLayout
      // only re-fires if the new content resizes the cell.
      const wasCollapsing = previous.collapsed && progress.value > 0;
      cancelAnimation(progress);
      progress.value = 1;
      // A row scrolled away mid-collapse would otherwise never leave the data.
      if (wasCollapsing) previous.onCollapsed();
      // An item that left mid-collapse elsewhere lands here still collapsed; finish it now.
      if (collapsed) onCollapsed();
      return;
    }
    progress.value = withTiming(
      collapsed ? 0 : 1,
      { duration: reduced ? 0 : 280, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished && collapsed) scheduleOnRN(onCollapsed);
      },
    );
    // `onCollapsed` is read when the animation starts; re-running on its identity would restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey, collapsed, reduced, progress]);
  // The resting style spells out `height`/`overflow`: animated props persist on the native view
  // until overwritten, so a cell recycled after a full collapse would otherwise stay 0pt tall.
  const animated = useAnimatedStyle(() =>
    progress.value >= 1 || height.value === 0
      ? { opacity: 1, height: 'auto', overflow: 'visible' }
      : { height: height.value * progress.value, opacity: progress.value, overflow: 'hidden' },
  );
  return (
    <Animated.View
      style={[style, animated]}
      onLayout={(e) => {
        if (!collapsed) height.value = e.nativeEvent.layout.height;
      }}
    >
      {children}
    </Animated.View>
  );
}
