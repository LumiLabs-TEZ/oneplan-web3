import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

export interface OnboardingCopyProps {
  items: { title: string; subtitle: string }[];
  index: number;
  reducedMotion: boolean;
  style?: StyleProp<ViewStyle>;
}

export function OnboardingCopy({ items, index, reducedMotion, style }: OnboardingCopyProps) {
  const [width, setWidth] = useState(0);
  const position = useSharedValue(index);
  useEffect(() => {
    position.set(reducedMotion ? index : withSpring(index, { duration: 650, dampingRatio: 1 }));
  }, [index, position, reducedMotion]);
  const pager = useAnimatedStyle(() => ({ transform: [{ translateX: -position.get() * width }] }));
  return (
    <View style={style} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <Animated.View style={[styles.pager, pager]}>
        {items.map((item, itemIndex) => (
          <CopySlide
            key={itemIndex}
            item={item}
            active={index === itemIndex}
            width={width}
            reducedMotion={reducedMotion}
          />
        ))}
      </Animated.View>
    </View>
  );
}

function CopySlide({
  item,
  active,
  width,
  reducedMotion,
}: {
  item: { title: string; subtitle: string };
  active: boolean;
  width: number;
  reducedMotion: boolean;
}) {
  const visibility = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    visibility.set(
      reducedMotion
        ? Number(active)
        : withSpring(Number(active), { duration: 650, dampingRatio: 1 }),
    );
  }, [active, reducedMotion, visibility]);
  const transition = useAnimatedStyle(() => ({
    opacity: visibility.get(),
    filter: [{ blur: reducedMotion ? 0 : (1 - visibility.get()) * 30 }],
  }));
  return (
    <Animated.View
      style={[styles.copy, { width }, transition]}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
    >
      <Text style={styles.title} numberOfLines={1}>
        {item.title}
      </Text>
      <Text style={styles.subtitle} numberOfLines={2}>
        {item.subtitle}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pager: { flexDirection: 'row', alignItems: 'flex-start' },
  copy: { alignItems: 'center', gap: 6 },
  title: { fontSize: 22, fontWeight: '600', color: '#FFFFFF', textAlign: 'center' },
  subtitle: { fontSize: 16, color: 'rgba(255,255,255,0.8)', textAlign: 'center' },
});
