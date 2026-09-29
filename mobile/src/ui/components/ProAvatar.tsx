import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { Avatar } from './Avatar';

export interface ProAvatarProps {
  uri?: string | null;
  /** Outer diameter in points. */
  size?: number;
  testID?: string;
}

/**
 * Port of `Component/Common/AvatarProPlaceholder.swift` (Pro variant): gradient disc, inset photo
 * at 0.86x, cyan/white glow ring, three stacked outer shadows, and a top-rounded "PRO" tab
 * clipped by the circle. SwiftUI's blurred strokes are approximated with inset box shadows.
 */
export function ProAvatar({ uri, size = 200, testID }: ProAvatarProps) {
  const s = size / 200;
  const inner = size * 0.86;
  const circle = { width: size, height: size, borderRadius: size / 2 };
  const badgeRadius = Math.max(size * 0.05, 3);

  return (
    <View
      testID={testID}
      style={[
        circle,
        {
          backgroundColor: colors.white,
          boxShadow: [
            `0px ${3 * s}px ${6.1 * s}px rgba(100,146,255,0.39)`,
            `0px ${13 * s}px ${11.4 * s}px rgba(149,209,255,0.25)`,
            `${-4.393 * s}px ${17.571 * s}px ${28.33 * s}px rgba(0,0,0,0.34)`,
          ].join(', '),
        },
      ]}
    >
      <View style={[circle, styles.clip]}>
        <LinearGradient
          colors={['rgba(255,255,255,0.19)', 'rgb(0,80,217)']}
          locations={[0, 0.83582]}
          style={StyleSheet.absoluteFill}
        />
        {/* `Avatar`'s root is `alignSelf: 'flex-start'`; the wrapper keeps it centered. */}
        <View>
          <Avatar uri={uri} size={inner} />
        </View>
        <View style={styles.badgeWrap} pointerEvents="none">
          <View
            testID="avatar-pro-tab"
            style={[
              styles.badge,
              {
                paddingHorizontal: Math.max(size * 0.04, 4),
                paddingTop: Math.max(size * 0.04, 3),
                paddingBottom: Math.max(size * 0.07, 5),
                borderTopLeftRadius: badgeRadius,
                borderTopRightRadius: badgeRadius,
                borderWidth: Math.max(size * 0.01, 1),
              },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                {
                  // Swift asks for `.heavy`, but the shipped iOS app renders the regular face.
                  ...beVietnamPro(Math.max(size * (20.079 / 200), 8)),
                  letterSpacing: size * (-0.8032 / 200),
                },
              ]}
            >
              PRO
            </Text>
          </View>
        </View>
      </View>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: size / 2,
            boxShadow: [
              `inset 0px ${-2 * s}px ${7 * s}px ${1.5 * s}px rgba(77,205,255,0.9)`,
              `inset ${-1.6 * s}px ${-1.6 * s}px ${4.4 * s}px ${1 * s}px rgba(255,255,255,0.95)`,
            ].join(', '),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  badgeWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  badge: {
    backgroundColor: colors.white,
    borderColor: colors.blueBase,
    borderBottomWidth: 0,
  },
  badgeText: { color: colors.blueBase },
});
