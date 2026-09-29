import { ActivityIndicator, StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';

import { colors } from '@/ui/theme';

export interface SpinnerProps {
  /** Expand to fill the parent (flex: 1) and centre the indicator. */
  fill?: boolean;
  size?: 'small' | 'large';
  style?: StyleProp<ViewStyle>;
}

export function Spinner({ fill = false, size = 'small', style }: SpinnerProps) {
  return (
    <View style={[styles.center, fill && styles.fill, style]}>
      <ActivityIndicator color={colors.blueBase} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  fill: { flex: 1 },
});
