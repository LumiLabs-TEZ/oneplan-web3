/**
 * Per-budget-payment progress track — port of the private `DepositProgressBar` in
 * `WhoDepositView.swift`. One segment per budget the member has a payment row in.
 */
import { StyleSheet, View } from 'react-native';

import { colors } from '@/ui/theme';

export interface DepositProgressBarProps {
  segments: readonly boolean[];
}

export function DepositProgressBar({ segments }: DepositProgressBarProps) {
  return (
    <View style={styles.row} testID="deposit-progress-bar">
      {segments.map((isPaid, index) => (
        <View
          key={index}
          style={[
            styles.segment,
            { backgroundColor: isPaid ? colors.contentM : colors.neutral200 },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 5 },
  segment: { flex: 1, maxWidth: 60, height: 6, borderRadius: 11 },
});
