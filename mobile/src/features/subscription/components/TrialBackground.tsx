import { BlurMask, Canvas, Circle } from '@shopify/react-native-skia';
import { useWindowDimensions } from 'react-native';

/** FreeTrialView's 500pt circle, centred in an 800pt frame and moved up 340pt. */
export function TrialBackground() {
  const { width } = useWindowDimensions();
  return (
    <Canvas pointerEvents="none" style={{ position: 'absolute', top: 0, width, height: 520 }}>
      <Circle cx={width / 2} cy={60} r={250} color="#33A3FF">
        <BlurMask blur={84.85} style="normal" />
      </Circle>
    </Canvas>
  );
}
