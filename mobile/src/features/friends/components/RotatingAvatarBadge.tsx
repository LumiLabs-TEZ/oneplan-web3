/**
 * Avatar inside a slowly rotating gradient caption ring — port of
 * `SendFriendRequestAvatarBadge` / `FriendRequestAvatarBadge`
 * (`SendFriendRequestView.swift:454-590`). 213.479 badge, 174 avatar with a 4pt
 * `rgb(213,226,255)` stroke and a blue glow; the ring loops 360° over 30s, linear, forever.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Avatar } from '@/ui/components';

import { CircularText } from './CircularText';

export const BADGE_SIZE = 213.479;
const PHOTO_SIZE = 174;
const TEXT_RADIUS = 95;
const ROTATION_MS = 30_000;

export interface RotatingAvatarBadgeProps {
  /** Already-repeated ring caption (`ringText`). */
  ringText: string;
  avatarUrl?: string | null;
  testID?: string;
}

export function RotatingAvatarBadge({ ringText, avatarUrl, testID }: RotatingAvatarBadgeProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.set(
      withRepeat(withTiming(360, { duration: ROTATION_MS, easing: Easing.linear }), -1, false),
    );
  }, [rotation]);

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.get()}deg` }] }));

  return (
    <View style={styles.badge} testID={testID}>
      <Animated.View style={[StyleSheet.absoluteFill, ringStyle]} pointerEvents="none">
        <CircularText
          text={ringText}
          size={BADGE_SIZE}
          radius={TEXT_RADIUS}
          testID="friend-badge-ring"
        />
      </Animated.View>
      <View style={styles.glow}>
        <Avatar uri={avatarUrl} size={PHOTO_SIZE} />
        {/* Ring as an overlay: a `borderWidth` on the Avatar frame shifts the image off-centre. */}
        <View style={styles.ring} pointerEvents="none" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // iOS draws the glow as a 38.7pt shadow on the avatar; RN can't shadow a clipped view on
  // Android, so the glow lives on this wrapper and the clip stays on the Avatar. `boxShadow`
  // renders the blue halo on both platforms (`elevation` is grey on Android); CSS blur is ~2×
  // the Core Animation radius. The fill gives the shadow a solid disc to cast from.
  glow: {
    borderRadius: PHOTO_SIZE / 2,
    backgroundColor: 'rgb(213, 226, 255)',
    boxShadow: '0px 0px 77px rgba(39, 75, 255, 0.83)',
  },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
    borderWidth: 4,
    borderColor: 'rgb(213, 226, 255)',
  },
});
