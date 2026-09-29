/**
 * 52pt gradient close button pinned to the bottom of both friend root modals — port of
 * `Component/BottomSheet/DismissButton.swift` (identical to the private
 * `FriendRequestDismissButton` in `ReceiveFriendRequestView.swift:358`). Dismiss only: iOS never
 * declines the request from here.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';
import Svg, { Defs, Ellipse, Line, RadialGradient, Stop } from 'react-native-svg';

import { colors } from '@/ui/theme';

const SIZE = 52;
/** SF Symbol `xmark` at 17.8pt `.light` draws a ~13pt cross with a hairline-ish stroke. */
const GLYPH = 13;
const GLYPH_STROKE = 1.4;

export interface FriendRequestDismissButtonProps {
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function FriendRequestDismissButton({
  onPress,
  disabled = false,
  accessibilityLabel,
  style,
  testID,
}: FriendRequestDismissButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.outerShadow, pressed && styles.pressed, style]}
      testID={testID}
    >
      {/* Two stacked shadows like iOS; the clipped face lives inside so they aren't cut off. */}
      <View style={styles.innerShadow}>
        <View style={styles.face}>
          <LinearGradient
            colors={['#ECECEC', '#B3B3B3', '#EBEBEB']}
            locations={[0, 0.745, 1]}
            style={StyleSheet.absoluteFill}
          />
          {/* iOS's blurred `.plusLighter` highlight: a 43.7×16.3 ellipse 18pt above centre. */}
          <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <RadialGradient id="dismissHighlight" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0" stopColor={colors.white} stopOpacity={0.85} />
                <Stop offset="0.7" stopColor={colors.white} stopOpacity={0.75} />
                <Stop offset="1" stopColor={colors.white} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse
              cx={SIZE / 2}
              cy={SIZE / 2 - 18}
              rx={24.5}
              ry={10.5}
              fill="url(#dismissHighlight)"
            />
          </Svg>
          <Svg width={GLYPH} height={GLYPH} pointerEvents="none">
            {[
              [0, 0, GLYPH, GLYPH],
              [GLYPH, 0, 0, GLYPH],
            ].map(([x1, y1, x2, y2]) => (
              <Line
                key={`${x1}-${y1}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={colors.contentB}
                strokeOpacity={0.85}
                strokeWidth={GLYPH_STROKE}
                strokeLinecap="round"
              />
            ))}
          </Svg>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outerShadow: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: '#D6D6D6',
    shadowColor: 'rgb(150, 150, 150)',
    shadowOpacity: 0.25,
    shadowRadius: 5.7,
    shadowOffset: { width: 0, height: 13 },
    elevation: 6,
  },
  innerShadow: {
    flex: 1,
    borderRadius: SIZE / 2,
    shadowColor: 'rgb(195, 195, 195)',
    shadowOpacity: 0.39,
    shadowRadius: 3.05,
    shadowOffset: { width: 0, height: 3 },
  },
  face: {
    flex: 1,
    borderRadius: SIZE / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  pressed: { transform: [{ scale: 0.95 }] },
});
