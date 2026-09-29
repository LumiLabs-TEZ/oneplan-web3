import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  type PressableProps,
  StyleSheet,
  type StyleProp,
  Text,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated';

import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export type ButtonVariant = 'primary' | 'secondary' | 'toolbarIcon' | 'dark';

export interface ButtonProps {
  variant?: ButtonVariant;
  title?: string;
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  onPress?: PressableProps['onPress'];
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
  textStyle?: StyleProp<TextStyle>;
  /** Let localized / accessibility-size labels wrap and grow the button vertically. */
  multiline?: boolean;
  haptic?: 'light' | 'medium' | 'selection' | false;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PRESS_SCALE = 0.97;

export function Button({
  variant = 'primary',
  title,
  icon,
  loading = false,
  disabled = false,
  onPress,
  style,
  accessibilityLabel,
  testID,
  textStyle,
  multiline = false,
  haptic = variant === 'toolbarIcon' ? 'light' : 'medium',
}: ButtonProps) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const inactive = disabled || loading;

  const handlePressIn = () => {
    if (!reducedMotion) scale.set(withSpring(PRESS_SCALE, { damping: 20, stiffness: 300 }));
  };
  const handlePressOut = () => {
    scale.set(withSpring(1, { damping: 20, stiffness: 300 }));
  };
  const handlePress: PressableProps['onPress'] = (event) => {
    if (haptic === 'selection') void Haptics.selectionAsync().catch(() => undefined);
    else if (haptic)
      void Haptics.impactAsync(
        haptic === 'light' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
      ).catch(() => undefined);
    onPress?.(event);
  };

  const textColor = variant === 'primary' || variant === 'dark' ? colors.white : colors.contentB;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      testID={testID}
      disabled={inactive}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[
        styles.base,
        styles[variant],
        inactive && styles.inactive,
        animatedStyle,
        style,
        multiline && { height: 'auto', minHeight: 52, paddingVertical: 12 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} testID="button-loading" />
      ) : (
        <>
          {icon}
          {title ? (
            <Text
              style={[
                styles.title,
                variant === 'primary' && styles.primaryTitle,
                { color: textColor },
                textStyle,
                multiline && { flexShrink: 1, textAlign: 'center' },
              ]}
              numberOfLines={multiline ? undefined : 1}
            >
              {title}
            </Text>
          ) : null}
        </>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  // iOS `PrimaryButton`: glass-prominent capsule, regular 16pt system text.
  primary: {
    height: 48,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.pill,
    backgroundColor: colors.blueBase,
  },
  dark: {
    height: 52,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.pill,
    backgroundColor: colors.black,
  },
  secondary: {
    height: 52,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.dividerStroke,
  },
  toolbarIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
  },
  inactive: { opacity: 0.5 },
  title: { ...beVietnamPro(16, 'semibold') },
  primaryTitle: {
    fontFamily: Platform.select({ ios: 'System', default: 'sans-serif' }),
    fontSize: 16,
    fontWeight: '400',
  },
});
