import { Blur, Canvas, Group, Image, Rect, useImage, vec } from '@shopify/react-native-skia';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { images, svg } from '@/ui/assets';

import {
  coverScale,
  smoothSpring,
  SPLASH_LOGO_RADIUS,
  SPLASH_LOGO_SIZE,
  SPLASH_MOTION as M,
} from './splashMotion';

/**
 * Cold-start reveal, ported from `SplashScreenView.swift`: a black screen with the logo punched out
 * of it (white shows through), the logo dips to 0.8, then grows past the screen edges while blurring
 * and the whole overlay fades, revealing the app through the logo. Reduce Motion → the logo tile on
 * black, faded out. Hides the native splash once its first frame is on screen.
 */
export function AnimatedSplash({ onComplete }: { onComplete: () => void }) {
  const reduced = useReducedMotion();
  return reduced ? (
    <ReducedSplash onComplete={onComplete} />
  ) : (
    <RevealSplash onComplete={onComplete} />
  );
}

function RevealSplash({ onComplete }: { onComplete: () => void }) {
  const image = useImage(images.splashLogo);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const down = useSharedValue(1);
  const progress = useSharedValue(0);
  const ready = image !== null && size.width > 0;

  useEffect(() => {
    if (!ready) return;
    void SplashScreen.hideAsync();
    down.set(withDelay(M.initialDelayMs, withSpring(M.scaleDown, smoothSpring(M.scaleDownMs))));
    progress.set(
      withDelay(
        M.initialDelayMs + M.scaleUpDelayMs,
        withSpring(1, smoothSpring(M.scaleUpMs), (finished) => {
          if (finished) scheduleOnRN(onComplete);
        }),
      ),
    );
  }, [ready, down, progress, onComplete]);

  const maxScale = coverScale(size);
  const transform = useDerivedValue(() => [
    { scale: down.get() * (1 + (maxScale - 1) * progress.get()) },
  ]);
  const blur = useDerivedValue(() => M.blurRadius * progress.get());
  const opacity = useDerivedValue(() => 1 - progress.get());

  const cx = size.width / 2;
  const cy = size.height / 2;
  const half = SPLASH_LOGO_SIZE / 2;

  return (
    <View
      testID="animated-splash"
      pointerEvents="none"
      // Black only until the canvas draws; after that the canvas alone paints (and fades out), or
      // this view would hold a black screen over the revealed app until `onComplete`.
      style={[styles.fill, ready && styles.clear]}
      onLayout={(e: LayoutChangeEvent) =>
        setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })
      }
    >
      {ready ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Group opacity={opacity} layer>
            <Rect x={0} y={0} width={size.width} height={size.height} color="white" />
            <Group layer>
              <Rect x={0} y={0} width={size.width} height={size.height} color="black" />
              <Group transform={transform} origin={vec(cx, cy)}>
                <Image
                  image={image}
                  x={cx - half}
                  y={cy - half}
                  width={SPLASH_LOGO_SIZE}
                  height={SPLASH_LOGO_SIZE}
                  fit="contain"
                  blendMode="dstOut"
                >
                  <Blur blur={blur} />
                </Image>
              </Group>
            </Group>
          </Group>
        </Canvas>
      ) : null}
    </View>
  );
}

function ReducedSplash({ onComplete }: { onComplete: () => void }) {
  const Logo = svg.illustration.appLogo;
  const opacity = useSharedValue(1);
  const [laidOut, setLaidOut] = useState(false);

  useEffect(() => {
    if (!laidOut) return;
    void SplashScreen.hideAsync();
    opacity.set(
      withDelay(
        M.initialDelayMs,
        withTiming(0, { duration: M.reducedFadeMs, easing: Easing.out(Easing.ease) }, (finished) => {
          if (finished) scheduleOnRN(onComplete);
        }),
      ),
    );
  }, [laidOut, opacity, onComplete]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View
      testID="animated-splash"
      pointerEvents="none"
      style={[styles.fill, styles.reduced, style]}
      onLayout={() => setLaidOut(true)}
    >
      <View style={styles.logo}>
        <Logo width={SPLASH_LOGO_SIZE} height={SPLASH_LOGO_SIZE} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, backgroundColor: 'black' },
  clear: { backgroundColor: 'transparent' },
  reduced: { alignItems: 'center', justifyContent: 'center' },
  logo: {
    width: SPLASH_LOGO_SIZE,
    height: SPLASH_LOGO_SIZE,
    borderRadius: SPLASH_LOGO_RADIUS,
    overflow: 'hidden',
  },
});
