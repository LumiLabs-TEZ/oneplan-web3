/**
 * Glossy blue pill used for "Accept" / "Add Friend" on the friend-request modals — port of
 * `Component/Button/AddFriendButton.swift`: 40pt min height, vertical blue gradient, 1.5pt white
 * inset stroke and two soft blue drop shadows. Callers size the width (iOS frames it at 150).
 */
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  type StyleProp,
  Text,
  type ViewStyle,
} from 'react-native';

import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const RADIUS = 31;
const GRADIENT = ['rgba(71, 107, 255, 0.19)', 'rgb(0, 79, 217)'] as const;

export interface AddFriendButtonProps {
  title: string;
  onPress?: PressableProps['onPress'];
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function AddFriendButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  style,
  testID,
}: AddFriendButtonProps) {
  const inactive = disabled || loading;

  const handlePress: PressableProps['onPress'] = (event) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    onPress?.(event);
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      testID={testID}
      disabled={inactive}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.pill,
        inactive && styles.inactive,
        pressed && styles.pressed,
        style,
      ]}
    >
      <LinearGradient colors={GRADIENT} style={styles.fill} pointerEvents="none" />
      {loading ? (
        <ActivityIndicator color={colors.white} testID="add-friend-button-loading" />
      ) : (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS,
    borderWidth: 1.5,
    borderColor: colors.white,
    boxShadow: [
      { offsetX: 0, offsetY: 13, blurRadius: 11.4, color: 'rgba(148, 209, 255, 0.25)' },
      { offsetX: 0, offsetY: 3, blurRadius: 6.1, color: 'rgba(99, 145, 255, 0.39)' },
    ],
  },
  // Absolute children sit inside the border, so the opaque stroke frames the gradient as on iOS.
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: RADIUS - 1.5 },
  inactive: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  title: { ...beVietnamPro(14), color: colors.white, textAlign: 'center' },
});
