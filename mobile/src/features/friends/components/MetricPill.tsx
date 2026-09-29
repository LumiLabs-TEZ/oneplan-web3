/** Port of `FriendProfileMetricPill` (`FriendProfileView.swift:463-485`). */
import { StyleSheet, Text, View } from 'react-native';

import { NumericText } from '@/ui/components/NumericText';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface MetricPillProps {
  title: string;
  /** A count; negatives clamp to 0. */
  value: number;
  /** Zero-pad to this many digits (iOS `%02d` → 2). */
  minimumIntegerDigits?: number;
  testID?: string;
}

export function MetricPill({ title, value, minimumIntegerDigits, testID }: MetricPillProps) {
  return (
    <View style={styles.pill} testID={testID}>
      <NumericText
        value={Math.max(value, 0)}
        minimumIntegerDigits={minimumIntegerDigits}
        useGrouping={false}
        style={styles.value}
      />
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 19,
    backgroundColor: colors.white,
  },
  value: { ...beVietnamPro(16), color: colors.neutral900 },
  title: { ...beVietnamPro(16), color: colors.neutral900 },
});
