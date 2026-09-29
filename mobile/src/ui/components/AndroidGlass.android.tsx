import { BlurView } from 'expo-blur';
import type { ReactNode, RefObject } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Live backdrop blur plus an optical rim (inset highlights + light stroke). Refraction matching
 * remains a visual acceptance gate.
 * Without a `blurTarget` the dimezis blur has nothing to sample, so a translucent fill (the same
 * one the pre-iOS-26 sheet path uses) keeps content legible instead of rendering see-through.
 */
export function AndroidGlass({
  children,
  radius,
  intensity,
  colorScheme = 'light',
  blurTarget,
  style,
}: {
  children?: ReactNode;
  radius: number;
  intensity: number;
  colorScheme?: 'light' | 'dark';
  blurTarget?: RefObject<View | null>;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[style, { borderRadius: radius, overflow: 'hidden' }]}>
      {blurTarget?.current ? (
        <BlurView
          pointerEvents="none"
          blurTarget={blurTarget}
          blurMethod="dimezisBlurView"
          blurReductionFactor={4}
          intensity={intensity}
          tint={colorScheme}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.fallbackFill,
            colorScheme === 'dark' && { backgroundColor: 'rgba(38,38,38,0.7)' },
          ]}
        />
      )}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radius },
          colorScheme === 'dark' ? styles.rimDark : styles.rimLight,
        ]}
      />
      {children}
    </View>
  );
}

// The rim is plain view styling rather than a Skia canvas: each canvas allocates a GPU surface
// on the UI thread when mounted, and Fabric re-creates a tab's views every time it is shown.
const styles = StyleSheet.create({
  fallbackFill: { backgroundColor: 'rgba(255,255,255,0.7)' },
  rimLight: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    boxShadow: 'inset 0px 2px 3px rgba(255,255,255,0.65), inset 0px -2px 4px rgba(0,0,0,0.08)',
  },
  rimDark: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    boxShadow: 'inset 0px 2px 3px rgba(255,255,255,0.2), inset 0px -2px 4px rgba(0,0,0,0.08)',
  },
});
