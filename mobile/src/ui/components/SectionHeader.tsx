import { Pressable, StyleSheet, type StyleProp, Text, View, type ViewStyle } from 'react-native';

import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface SectionHeaderAction {
  label: string;
  onPress: () => void;
}

export interface SectionHeaderProps {
  title: string;
  /** Trailing action, e.g. "See all". */
  action?: SectionHeaderAction;
  style?: StyleProp<ViewStyle>;
}

/** Port of `Component/Home/HomeSectionHeader.swift`. */
export function SectionHeader({ title, action, style }: SectionHeaderProps) {
  return (
    <View style={[styles.row, style]}>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {action ? (
        <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={8}>
          <Text style={styles.action} numberOfLines={1}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    ...beVietnamPro(16, 'medium'),
    color: colors.contentM,
    letterSpacing: -0.32,
    flexShrink: 1,
  },
  action: { ...beVietnamPro(14), color: colors.contentM, letterSpacing: -0.28 },
});
