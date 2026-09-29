/**
 * Port of `Component/Common/PioneerAvatar.swift`: the trip cover masked by the rippled
 * `PioneerAvatarShape`, with a 5pt white outline. The mask and outline turn once every 38.2s
 * while the image itself stays still. Missing/failed covers show `defaultTripPlaceholder`.
 * Reduce Motion keeps the shape static.
 */
import MaskedView from '@react-native-masked-view/masked-view';
import { Image } from 'expo-image';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { CachedImage } from '@/ui/components';
import { colors } from '@/ui/theme';

import { buildPioneerPath } from '../helpers/pioneerPath';

const ROTATION_MS = 38_200;
const STROKE = 5;

export interface PioneerAvatarProps {
  size?: number;
  imageUrl?: string | null;
}

export function PioneerAvatar({ size = 220, imageUrl }: PioneerAvatarProps) {
  const d = useMemo(() => buildPioneerPath(size), [size]);
  const reduceMotion = useReducedMotion();
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    rotation.set(withRepeat(withTiming(360, { duration: ROTATION_MS, easing: Easing.linear }), -1));
    return () => cancelAnimation(rotation);
  }, [reduceMotion, rotation]);

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.get()}deg` }] }));
  const box = { width: size, height: size };

  return (
    <View style={box} testID="pioneer-avatar">
      <MaskedView
        style={StyleSheet.absoluteFill}
        maskElement={
          <Animated.View style={[box, spin]}>
            <Svg width={size} height={size}>
              <Path d={d} fill="black" />
            </Svg>
          </Animated.View>
        }
      >
        {/* Underlay: shown when there's no cover and while/if the remote one fails to load. */}
        <Image
          source={require('@/assets/images/market/defaultTripPlaceholder.png')}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
        <CachedImage uri={imageUrl} style={StyleSheet.absoluteFill} />
      </MaskedView>
      <Animated.View style={[StyleSheet.absoluteFill, spin]} pointerEvents="none">
        <Svg width={size} height={size}>
          <Path
            d={d}
            fill="none"
            stroke={colors.white}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}
