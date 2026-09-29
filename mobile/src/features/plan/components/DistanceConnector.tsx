/**
 * Vertical connector between two consecutive timeline items showing the
 * distance to the next stop. Tapping opens the maps chooser. Port of
 * `TripPlanDistanceConnector` (`ios/OnePlan/OnePlan/Component/Trip/TripPlanSection.swift:704-728`).
 */
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/ui/theme';

export interface DistanceConnectorProps {
  label: string;
  onPress?: () => void;
  testID?: string;
}

export function DistanceConnector({ label, onPress, testID }: DistanceConnectorProps) {
  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.rule} />
      <Pressable
        accessibilityRole={onPress ? 'button' : undefined}
        disabled={!onPress}
        onPress={onPress}
        style={styles.pill}
      >
        <Text style={styles.label}>{label}</Text>
        <Ionicons name="arrow-forward" size={12} color={colors.white} />
      </Pressable>
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { height: 37, alignItems: 'center', justifyContent: 'center', gap: 2 },
  rule: { width: 1, flex: 1, backgroundColor: 'rgba(199, 199, 199, 0.22)' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.blueBase,
  },
  label: { fontSize: 12, fontWeight: '600', color: colors.white },
});
