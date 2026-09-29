import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { ComponentProps, ReactNode, RefObject } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/ui/theme';

import { GlassSurface, type GlassSurfaceProps } from './GlassSurface';

/** Diameter of the glass circle — screens with a floating toolbar pad content by it. */
export const GLASS_ICON_BUTTON_SIZE = 45;
const SIZE = GLASS_ICON_BUTTON_SIZE;

export interface GlassIconButtonProps {
  label: string;
  onPress: () => void;
  /** Ionicons glyph; ignored when `children` supplies a custom icon. */
  icon?: ComponentProps<typeof Ionicons>['name'];
  children?: ReactNode;
  disabled?: boolean;
  testID?: string;
  /** Glass tint — `dark` for buttons over dark full-bleed backdrops (e.g. onboarding). */
  colorScheme?: GlassSurfaceProps['colorScheme'];
  /** Android: view to blur behind the glass. */
  blurTarget?: RefObject<View | null>;
  /** Light impact on press, like `Button`'s `toolbarIcon`; `false` to opt out. */
  haptic?: boolean;
}

/** Circular glass toolbar button — port of `ToolbarIconButton` / the iOS 26 system back button. */
export function GlassIconButton({
  label,
  onPress,
  icon,
  children,
  disabled = false,
  testID,
  colorScheme,
  blurTarget,
  haptic = true,
}: GlassIconButtonProps) {
  const handlePress = () => {
    if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onPress();
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      testID={testID}
      hitSlop={6}
      style={[styles.shadow, disabled && styles.disabled]}
      onPress={handlePress}
    >
      <GlassSurface
        preset="control"
        radius={999}
        colorScheme={colorScheme}
        blurTarget={blurTarget}
        style={styles.button}
      >
        {children ?? (icon ? <Ionicons name={icon} size={24} color={colors.contentB} /> : null)}
      </GlassSurface>
    </Pressable>
  );
}

/**
 * The same glass circle without its own press handling — for triggers whose parent owns the
 * tap, e.g. a native `MenuView` (a nested `Pressable` would swallow the touch).
 */
export function GlassIconCircle({ children }: { children: ReactNode }) {
  return (
    <View style={styles.shadow}>
      <GlassSurface preset="control" radius={999} style={styles.button}>
        {children}
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: { borderRadius: 999, boxShadow: '0px 2px 6px rgba(0,0,0,0.10)' },
  disabled: { opacity: 0.45 },
  button: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
});
