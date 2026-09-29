import { StyleSheet, Text, type StyleProp, type TextStyle, View } from 'react-native';

import { mrzLineOne, mrzLineTwo } from '@/features/passport/helpers/mrz';
import { beVietnamPro } from '@/ui/typography';

export interface PassportMRZLinesProps {
  displayName: string;
  memberSince: string | null;
  /** iOS default is `Color.white.opacity(0.4)`; PassportCard passes an opaque grey instead. */
  color?: string;
  style?: StyleProp<TextStyle>;
  testID?: string;
}

/**
 * Port of `Component/Common/PassportMRZLines.swift`. iOS uses `.font(.system(design: .rounded))`
 * — there is no bundled rounded face, so this substitutes `beVietnamPro` (regular weight).
 */
export function PassportMRZLines({
  displayName,
  memberSince,
  color = 'rgba(161, 161, 161, 1)',
  style,
  testID,
}: PassportMRZLinesProps) {
  return (
    <View style={styles.container} testID={testID}>
      <Text style={[styles.line, { color }, style]} numberOfLines={1}>
        {mrzLineOne(displayName, memberSince)}
      </Text>
      <Text style={[styles.line, { color }, style]} numberOfLines={1}>
        {mrzLineTwo(memberSince)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 3 },
  line: { ...beVietnamPro(10, 'regular'), letterSpacing: -0.3 },
});
