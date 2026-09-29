/**
 * JS port of `MorphingTabBar.swift` + `ExpandableGlassEffect.swift` (Android, and iOS builds
 * without the `ParityUI` native view). The segmented row imitates the iOS 26 glass lens: it lifts
 * on touch, can be dragged across tabs, stretches while travelling and commits on release with a
 * selection haptic. Tapping the FAB morphs the pill into the quick-action card.
 */
import * as Haptics from 'expo-haptics';
import { type ComponentType, type ReactNode, useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { GlassSurface } from '@/ui/components/GlassSurface';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { MORPH_SPRING, morphFrame } from '../morph';

export const BAR_HEIGHT = 58;
const ROW_HEIGHT = 54;
const ICON = 24;
/** Lens travel — snappy with a little overshoot, like the system segment slide. */
const LENS_SPRING = { mass: 1, stiffness: 320, damping: 26 } as const;
const PRESS_SPRING = { mass: 1, stiffness: 420, damping: 24 } as const;

/** One segment. `name` doubles as the `tab-<name>` testID; `label` is already translated. */
export interface MorphingTabItem {
  name: string;
  label: string;
  icon: ComponentType<{ width: number; height: number }>;
  iconActive: ComponentType<{ width: number; height: number }>;
}

interface TabRowProps {
  tabs: readonly MorphingTabItem[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

function TabRow({ tabs, activeIndex, onSelect }: TabRowProps) {
  const [width, setWidth] = useState(0);
  const count = tabs.length;
  const segment = width > 0 ? width / count : 0;

  const x = useSharedValue(0);
  const target = useSharedValue(0);
  const pressed = useSharedValue(0);
  const hover = useSharedValue(activeIndex);
  const dragging = useSharedValue(false);

  useEffect(() => {
    if (segment <= 0 || dragging.get()) return;
    hover.set(activeIndex);
    target.set(activeIndex * segment);
    x.set(withSpring(activeIndex * segment, LENS_SPRING));
  }, [activeIndex, segment, dragging, hover, target, x]);

  const commit = useCallback(
    (index: number) => {
      if (index === activeIndex) return;
      void Haptics.selectionAsync();
      onSelect(index);
    },
    [activeIndex, onSelect],
  );

  const pan = Gesture.Pan()
    .minDistance(0)
    .shouldCancelWhenOutside(false)
    .onBegin((e) => {
      if (segment <= 0) return;
      const index = Math.max(0, Math.min(count - 1, Math.floor(e.x / segment)));
      hover.set(index);
      // Touching the selected segment lifts the lens so it can be dragged (iOS 26 behaviour).
      dragging.set(index === activeIndex);
      if (index === activeIndex) pressed.set(withSpring(1, PRESS_SPRING));
    })
    .onUpdate((e) => {
      if (segment <= 0) return;
      hover.set(Math.max(0, Math.min(count - 1, Math.floor(e.x / segment))));
      if (!dragging.get()) return;
      const next = Math.max(0, Math.min(width - segment, e.x - segment / 2));
      target.set(next);
      x.set(withSpring(next, PRESS_SPRING));
    })
    .onFinalize((e) => {
      if (segment <= 0) return;
      const inside = e.y >= -20 && e.y <= ROW_HEIGHT + 20;
      const index = inside || dragging.get() ? hover.get() : activeIndex;
      dragging.set(false);
      pressed.set(withSpring(0, PRESS_SPRING));
      target.set(index * segment);
      x.set(withSpring(index * segment, LENS_SPRING));
      runOnJS(commit)(index);
    });

  // Stretch along the travel direction while the lens is far from where it is heading.
  const stretch = useDerivedValue(() =>
    segment > 0 ? Math.min(Math.abs(target.value - x.value) / segment, 1) : 0,
  );
  const lensStyle = useAnimatedStyle(() => {
    // Spring overshoot takes `pressed` slightly outside 0…1 and near-zero values stringify in
    // exponent form (`9e-7`); Reanimated's Android color parser throws on either, crashing the app.
    const p = Math.min(Math.max(pressed.value, 0), 1);
    return {
      width: segment,
      opacity: segment > 0 ? 1 : 0,
      backgroundColor: p > 0.5 ? 'rgba(255,255,255,0.55)' : 'rgba(128,128,128,0.15)',
      borderColor: `rgba(255,255,255,${(0.9 * p).toFixed(3)})`,
      boxShadow: `0px ${(4 * p).toFixed(2)}px ${(12 * p).toFixed(2)}px rgba(0,0,0,${(0.12 * p).toFixed(3)})`,
      transform: [
        { translateX: x.value },
        { scaleX: 1 + 0.18 * pressed.value + 0.22 * stretch.value },
        { scaleY: 1 + 0.18 * pressed.value - 0.08 * stretch.value },
      ],
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <View
        style={styles.tabRow}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessibilityRole="tablist"
      >
        <Animated.View style={[styles.lens, lensStyle]} />
        {tabs.map((tab, index) => {
          const active = index === activeIndex;
          const Icon = active ? tab.iconActive : tab.icon;
          return (
            <View
              key={tab.name}
              accessible
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.label}
              accessibilityActions={[{ name: 'activate' }]}
              onAccessibilityAction={() => commit(index)}
              testID={`tab-${tab.name}`}
              style={styles.tab}
            >
              <Icon width={ICON} height={ICON} />
              <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                {tab.label}
              </Text>
            </View>
          );
        })}
      </View>
    </GestureDetector>
  );
}

interface MorphingTabBarProps extends TabRowProps {
  expanded: boolean;
  /** The quick-action rows the pill morphs into; omitted by bars without a FAB. */
  children?: ReactNode;
}

export function MorphingTabBar({ expanded, children, ...row }: MorphingTabBarProps) {
  const [contentHeight, setContentHeight] = useState(0);
  const progress = useSharedValue(expanded ? 1 : 0);
  const measured = useSharedValue(0);

  useEffect(() => {
    measured.set(contentHeight);
  }, [contentHeight, measured]);
  useEffect(() => {
    progress.set(withSpring(expanded ? 1 : 0, MORPH_SPRING));
  }, [expanded, progress]);

  const cardStyle = useAnimatedStyle(() => {
    const f = morphFrame(progress.value, BAR_HEIGHT, measured.value);
    return {
      height: Math.max(f.height, BAR_HEIGHT * 0.5),
      transform: [{ translateY: f.translateY }, { scaleX: f.scaleX }, { scaleY: f.scaleY }],
    };
  });
  const contentStyle = useAnimatedStyle(() => {
    const f = morphFrame(progress.value, BAR_HEIGHT, measured.value);
    return {
      opacity: f.contentOpacity,
      top: (f.height - measured.value) / 2,
      transform: [{ scale: f.contentScale }],
    };
  });
  const labelStyle = useAnimatedStyle(() => {
    const f = morphFrame(progress.value, BAR_HEIGHT, measured.value);
    return { opacity: 1 - f.labelOpacity, top: (f.height - BAR_HEIGHT) / 2 };
  });

  return (
    <Animated.View style={[styles.card, cardStyle]}>
      <GlassSurface preset="control" radius={BAR_HEIGHT / 2} style={styles.glass}>
        <Animated.View
          style={[styles.content, contentStyle]}
          pointerEvents={expanded ? 'auto' : 'none'}
          accessibilityElementsHidden={!expanded}
          importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
          onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}
        >
          {children}
        </Animated.View>
        <Animated.View
          style={[styles.labelLayer, labelStyle]}
          pointerEvents={expanded ? 'none' : 'auto'}
          accessibilityElementsHidden={expanded}
          importantForAccessibility={expanded ? 'no-hide-descendants' : 'auto'}
        >
          <TabRow {...row} />
        </Animated.View>
      </GlassSurface>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1 },
  glass: { flex: 1 },
  content: { position: 'absolute', left: 0, right: 0 },
  labelLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: BAR_HEIGHT,
    paddingHorizontal: 2,
    justifyContent: 'center',
  },
  tabRow: { height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', top: -0.7 },
  lens: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: ROW_HEIGHT / 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, height: ROW_HEIGHT },
  label: { ...beVietnamPro(13, 'regular'), color: colors.contentL },
  labelActive: { color: colors.blueBase },
});
