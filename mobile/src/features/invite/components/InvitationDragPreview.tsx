/**
 * Port of `InvitationDragPreview` (`View/Trip/TripInvitationView.swift:250-406`):
 * a gradient pill the avatar is dragged down, three chevrons, and the trip cover
 * card it drops into. All thresholds live in `helpers/dragToJoin.ts`.
 */
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { images } from '@/ui/assets';
import { Avatar, CachedImage } from '@/ui/components';
import { colors } from '@/ui/theme';

import {
  BASE_PILL_HEIGHT,
  dragProgress,
  hapticsToFire,
  MAX_AVATAR_ROTATION,
  MAX_DRAG,
  milestoneIndex,
  shouldJoin,
  topPillHeight,
} from '../helpers/dragToJoin';

const CONTAINER_WIDTH = 120;
const CONTAINER_HEIGHT = 450;
const PILL_WIDTH = 100;
const CARD_SIZE = 120;
const AVATAR_SIZE = 100;
/**
 * SwiftUI centres the 310pt-tall ZStack (the pill track) inside its 450pt frame, so every
 * layer sits 70pt lower than its raw offset.
 */
const CONTENT_TOP = (CONTAINER_HEIGHT - BASE_PILL_HEIGHT) / 2;
const AVATAR_TOP = CONTENT_TOP - 50;
const INDICATORS_TOP = CONTENT_TOP + 80;
const CARD_TOP = CONTENT_TOP + 245;
const PHOTO_TOP = CONTENT_TOP + 253.5;
const CHEVRON_SIZE = 32;
const AVATAR_RING = 'rgb(213, 226, 255)';
/** `.spring(response: 0.34, dampingFraction: 0.86)` ≈ damping 18 / stiffness 180. */
const SPRING = { damping: 18, stiffness: 180 } as const;

export interface InvitationDragPreviewProps {
  coverImageUrl?: string | null;
  avatarUrl?: string | null;
  isJoining: boolean;
  /** Bumped by the parent to send the avatar home after a failed join / conflict alert. */
  resetSignal: number;
  onJoinTriggered: () => void;
}

export function InvitationDragPreview({
  coverImageUrl,
  avatarUrl,
  isJoining,
  resetSignal,
  onJoinTriggered,
}: InvitationDragPreviewProps) {
  const offset = useSharedValue(0);
  const latched = useSharedValue(0);
  const milestone = useSharedValue(0);

  const fireHaptics = useCallback((prev: number, next: number) => {
    for (let i = 0; i < hapticsToFire(prev, next); i += 1) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
  }, []);

  const fireLatchHaptic = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  }, []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onUpdate((event) => {
          'worklet';
          if (isJoining || latched.get() === 1) return;
          const y = Math.min(Math.max(0, event.translationY), MAX_DRAG);
          offset.set(y);
          const next = milestoneIndex(dragProgress(y));
          if (next > milestone.get()) {
            runOnJS(fireHaptics)(milestone.get(), next);
            milestone.set(next);
          }
        })
        .onEnd(() => {
          'worklet';
          if (isJoining || latched.get() === 1) return;
          milestone.set(0);
          if (shouldJoin(dragProgress(offset.get()))) {
            latched.set(1);
            offset.set(withSpring(MAX_DRAG, SPRING));
            runOnJS(fireLatchHaptic)();
            runOnJS(onJoinTriggered)();
            return;
          }
          offset.set(withSpring(0, SPRING));
        }),
    [fireHaptics, fireLatchHaptic, isJoining, latched, milestone, offset, onJoinTriggered],
  );

  const pillStyle = useAnimatedStyle(() => ({
    height: topPillHeight(offset.get()),
  }));

  const avatarStyle = useAnimatedStyle(() => {
    const progress = dragProgress(offset.get());
    return {
      transform: [{ translateY: offset.get() }, { rotate: `${progress * MAX_AVATAR_ROTATION}deg` }],
    };
  });

  // Failed join / dismissed conflict alert: send the avatar home and allow a retry.
  useEffect(() => {
    if (resetSignal === 0) return;
    latched.set(0);
    milestone.set(0);
    offset.set(withSpring(0, SPRING));
  }, [resetSignal, latched, milestone, offset]);

  return (
    <View style={styles.container} testID="invitation-drag-preview">
      <View style={styles.pillTrack} pointerEvents="none">
        <Animated.View style={[styles.pill, pillStyle]}>
          <LinearGradient
            colors={['rgba(214, 237, 255, 0.25)', 'rgb(148, 209, 255)']}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>

      {isJoining ? (
        <View style={styles.indicators} pointerEvents="none">
          <ActivityIndicator color={colors.white} testID="invitation-joining-spinner" />
        </View>
      ) : (
        <View style={styles.indicators} pointerEvents="none">
          {[0.3, 0.7, 1].map((opacity) => (
            <DoubleChevron key={opacity} opacity={opacity} />
          ))}
        </View>
      )}

      <View style={styles.card} pointerEvents="none" />

      <Animated.View style={[styles.avatar, avatarStyle]}>
        <GestureDetector gesture={pan}>
          <View>
            <Avatar uri={avatarUrl} size={AVATAR_SIZE} />
            {/* SwiftUI strokes the ring as an overlay centred on the edge; a `borderWidth` on
                the Avatar frame would push the image 4pt off-centre instead. */}
            <View style={styles.avatarRing} pointerEvents="none" />
          </View>
        </GestureDetector>
      </Animated.View>

      <View style={styles.photo} pointerEvents="none">
        {/* Backdrop so a slow or failed load shows the iOS placeholder, not a grey card. */}
        <Image
          source={images.trip.defaultTripPlaceholder}
          style={[StyleSheet.absoluteFill, styles.photoImage]}
          resizeMode="cover"
        />
        <CachedImage uri={coverImageUrl} style={styles.photoImage} />
      </View>
    </View>
  );
}

/** Port of `DoubleChevronDownShape` + `ArrowIndicator`: two stacked chevrons, white stroke 3. */
function DoubleChevron({ opacity }: { opacity: number }) {
  const s = CHEVRON_SIZE;
  const left = s * 0.18;
  const right = s - s * 0.18;
  const mid = s / 2;
  const d = (
    [
      [0.18, 0.44],
      [0.5, 0.78],
    ] as const
  )
    .map(([top, bottom]) => `M${left} ${s * top} L${mid} ${s * bottom} L${right} ${s * top}`)
    .join(' ');
  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <Path
        d={d}
        stroke={colors.white}
        strokeOpacity={opacity}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: { width: CONTAINER_WIDTH, height: CONTAINER_HEIGHT },
  pillTrack: {
    position: 'absolute',
    top: CONTENT_TOP,
    left: (CONTAINER_WIDTH - PILL_WIDTH) / 2,
    width: PILL_WIDTH,
    height: BASE_PILL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 0,
  },
  pill: {
    width: PILL_WIDTH,
    borderTopLeftRadius: PILL_WIDTH / 2,
    borderTopRightRadius: PILL_WIDTH / 2,
    overflow: 'hidden',
  },
  indicators: {
    position: 'absolute',
    top: INDICATORS_TOP,
    width: CONTAINER_WIDTH,
    alignItems: 'center',
    gap: 20,
    zIndex: 2,
  },
  card: {
    position: 'absolute',
    top: CARD_TOP,
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 30,
    backgroundColor: colors.onSurface,
    borderWidth: 0.733,
    borderColor: 'rgba(0, 0, 0, 0.15)',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 23.463,
    shadowOffset: { width: 0, height: 2.933 },
    elevation: 4,
    zIndex: 3,
  },
  avatar: {
    position: 'absolute',
    top: AVATAR_TOP,
    left: (CONTAINER_WIDTH - AVATAR_SIZE) / 2,
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    zIndex: 4,
    shadowColor: 'rgb(39, 75, 255)',
    shadowOpacity: 0.53,
    shadowRadius: 20.9,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  avatarRing: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: AVATAR_SIZE + 4,
    height: AVATAR_SIZE + 4,
    borderRadius: (AVATAR_SIZE + 4) / 2,
    borderWidth: 4,
    borderColor: AVATAR_RING,
  },
  photo: {
    position: 'absolute',
    top: PHOTO_TOP,
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 0.733,
    borderColor: 'rgba(0, 0, 0, 0.15)',
    zIndex: 5,
  },
  photoImage: { width: CARD_SIZE, height: CARD_SIZE },
});
