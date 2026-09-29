import { StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';

export interface DashedLineProps {
  color?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Horizontal dashed divider — port of `PassportCard.swift`'s `DashedLine` shape. */
export function DashedLine({ color = '#D4D4D4', style, testID }: DashedLineProps) {
  return <View testID={testID} style={[styles.line, { borderColor: color }, style]} />;
}

const styles = StyleSheet.create({
  line: {
    height: 1,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
  },
});
