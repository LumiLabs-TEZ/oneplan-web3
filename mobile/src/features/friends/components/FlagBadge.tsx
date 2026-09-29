/**
 * Small round flag chip in the send-request passport strip — port of
 * `SendFriendRequestPassportFlagBadge` (`SendFriendRequestView.swift:266-390`). iOS draws each
 * flag as vector shapes; this renders the country's emoji flag on the flag's primary colour ⚫
 * (vector fidelity — the locked mock keeps the same six countries either way).
 */
import { StyleSheet, type StyleProp, Text, View, type ViewStyle } from 'react-native';

export interface FlagBadgeProps {
  /** Emoji flag, e.g. `🇻🇳`. */
  flag: string;
  /** Circle fill — the flag's dominant colour. */
  color: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** The six locked badges from the iOS mock, in order. */
export const FIXED_FLAG_BADGES: readonly { flag: string; color: string }[] = [
  { flag: '🇻🇳', color: '#DE2110' },
  { flag: '🇵🇭', color: '#0A4AB8' },
  { flag: '🇵🇪', color: '#CF1433' },
  { flag: '🇦🇷', color: '#78BAF2' },
  { flag: '🇧🇷', color: '#21A345' },
  { flag: '🇳🇬', color: '#009260' },
];

const DEFAULT_SIZE = 24;

export function FlagBadge({ flag, color, size = DEFAULT_SIZE, style, testID }: FlagBadgeProps) {
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        style,
      ]}
      testID={testID}
    >
      <Text style={[styles.flag, { fontSize: size * 0.62 }]} allowFontScaling={false}>
        {flag}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 0.256,
    borderColor: 'rgb(84, 84, 84)',
  },
  flag: { textAlign: 'center' },
});
