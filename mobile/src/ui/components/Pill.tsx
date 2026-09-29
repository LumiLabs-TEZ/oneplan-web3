import { Pressable, StyleSheet, type StyleProp, Text, type ViewStyle } from 'react-native';

import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface PillProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Secondary action (e.g. long-press the "Share" pill to copy the link). */
  onLongPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Capsule filter/tag label. Selected = blueAlpha10 fill + blueBase text. */
export function Pill({
  label,
  selected = false,
  onPress,
  onLongPress,
  disabled = false,
  style,
  testID,
}: PillProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled || (!onPress && !onLongPress)}
      onPress={onPress}
      onLongPress={onLongPress}
      testID={testID}
      style={[styles.pill, selected && styles.selected, disabled && styles.disabled, style]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: 28,
    backgroundColor: 'transparent',
    alignSelf: 'flex-start',
  },
  selected: { backgroundColor: colors.blueAlpha10 },
  disabled: { opacity: 0.5 },
  label: { ...beVietnamPro(13, 'medium'), color: colors.contentM },
  labelSelected: { color: colors.blueBase },
});
