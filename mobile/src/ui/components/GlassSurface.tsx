import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode, RefObject } from 'react';
import { Platform, StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';

import { useGlassBackdrop } from './GlassBackdrop';
import { AndroidGlass } from './AndroidGlass';
import { colors, radius as radiusTokens } from '@/ui/theme';

export interface GlassSurfaceProps {
  children?: ReactNode;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  /** Explicit SwiftUI material; omitted keeps existing callers stable during migration. */
  preset?: 'control' | 'sheet';
  variant?: 'default' | 'marketplace';
  colorScheme?: 'light' | 'dark';
  blurTarget?: RefObject<View | null>;
}

/**
 * Shared material adapter. Android presets blur `blurTarget` (a view containing the visible
 * backdrop); without one `AndroidGlass` falls back to a translucent fill.
 */
export function GlassSurface({
  children,
  radius = radiusTokens.lg,
  style,
  variant = 'default',
  colorScheme = 'light',
  blurTarget: explicitBlurTarget,
  preset,
}: GlassSurfaceProps) {
  const inheritedBackdrop = useGlassBackdrop();
  const blurTarget =
    explicitBlurTarget ?? (inheritedBackdrop?.ready ? inheritedBackdrop.ref : undefined);
  const shape = { borderRadius: radius };
  if (preset) {
    if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
      return (
        <GlassView
          glassEffectStyle="regular"
          colorScheme={colorScheme}
          isInteractive={preset === 'control'}
          style={[styles.base, shape, style]}
        >
          {children}
        </GlassView>
      );
    }
    if (Platform.OS === 'android') {
      return (
        <AndroidGlass
          radius={radius}
          colorScheme={colorScheme}
          intensity={preset === 'sheet' ? 80 : 40}
          blurTarget={blurTarget}
          style={[styles.base, shape, style]}
        >
          {children}
        </AndroidGlass>
      );
    }
    // LiquidGlassCompat.swift deliberately uses an opaque shadow caster below iOS 26.
    if (preset === 'control') {
      return (
        <View
          style={[
            styles.legacyControl,
            colorScheme === 'dark' && { backgroundColor: '#262626' },
            shape,
            style,
          ]}
        >
          {children}
        </View>
      );
    }
    return (
      <BlurView
        intensity={80}
        tint="light"
        style={[styles.base, shape, { backgroundColor: 'rgba(255,255,255,0.7)' }, style]}
      >
        {children}
      </BlurView>
    );
  }
  if (variant === 'marketplace') {
    if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
      return (
        <GlassView
          glassEffectStyle="regular"
          tintColor="rgba(255,255,255,0.35)"
          style={[styles.base, shape, style]}
        >
          {children}
        </GlassView>
      );
    }
    return (
      <BlurView
        blurTarget={blurTarget}
        blurMethod="dimezisBlurView"
        blurReductionFactor={4}
        intensity={40}
        tint="light"
        style={[styles.base, styles.border, shape, style]}
      >
        {children}
      </BlurView>
    );
  }
  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={40} tint="light" style={[styles.base, styles.border, shape, style]}>
        {children}
      </BlurView>
    );
  }
  return <View style={[styles.base, styles.androidFill, shape, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
  border: { borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.6)' },
  legacyControl: {
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.06)',
    boxShadow: '0px 2px 6px rgba(0,0,0,0.10)',
  },
  androidFill: { backgroundColor: colors.surface + 'E6' },
});
