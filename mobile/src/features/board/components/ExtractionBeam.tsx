import { Canvas, RoundedRect, SweepGradient, vec } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import {
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import { colors } from '@/ui/theme';
export function ExtractionBeam() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { width, height } = size;
  const rotation = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!reduced) rotation.set(withRepeat(withTiming(Math.PI * 2, { duration: 3000 }), -1));
    return () => cancelAnimation(rotation);
  }, [reduced, rotation]);
  const transform = useDerivedValue(() => [{ rotate: rotation.get() }]);
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(event: LayoutChangeEvent) =>
        setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })
      }
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <RoundedRect
          x={2}
          y={2}
          width={Math.max(0, width - 4)}
          height={Math.max(0, height - 4)}
          r={20}
          style="stroke"
          strokeWidth={3}
        >
          <SweepGradient
            c={vec(width / 2, height / 2)}
            colors={['#30C48C', colors.blueBase, '#FF76B4', '#FFAA33', '#5856D6', '#30C48C']}
            transform={transform}
            origin={vec(width / 2, height / 2)}
          />
        </RoundedRect>
      </Canvas>
    </View>
  );
}
