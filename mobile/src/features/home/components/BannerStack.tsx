/**
 * Queue-with-depth wrapper for the Home banners. The front card (`children`) is the item being
 * handled; up to `MAX_DEPTH` blank cards peek out *above* it to show more are waiting, and a
 * `+N` badge counts every item behind the front. Depth cards are decorative only — the front
 * card owns every interaction. Trip invites and friend requests each get their own stack.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { NumericText } from '@/ui/components/NumericText';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const MAX_DEPTH = 2;
const PEEK = 8;
const INSET = 12;
const DEPTH_OPACITY = [0.7, 0.45];

export interface BannerStackProps {
  /** Total pending items, including the one on the front card. */
  count: number;
  children: ReactNode;
  testID?: string;
}

export function BannerStack({ count, children, testID }: BannerStackProps) {
  const waiting = Math.max(count - 1, 0);
  const depth = Math.min(waiting, MAX_DEPTH);
  // Farthest card first so each nearer card draws over it.
  const levels = Array.from({ length: depth }, (_, i) => depth - i);

  return (
    <Animated.View
      testID={testID}
      layout={LinearTransition.duration(220)}
      exiting={FadeOut.duration(220)}
      style={{ paddingTop: depth * PEEK }}
    >
      {levels.map((level) => (
        <Animated.View
          key={level}
          testID={testID ? `${testID}-depth` : undefined}
          pointerEvents="none"
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          layout={LinearTransition.duration(220)}
          style={[
            styles.depthSlot,
            {
              top: (depth - level) * PEEK,
              bottom: level * PEEK,
              left: level * INSET,
              right: level * INSET,
            },
          ]}
        >
          {/* Opacity lives on an inner view — the fade animations own the slot's opacity. */}
          <View style={[styles.depthCard, { opacity: DEPTH_OPACITY[level - 1] }]} />
        </Animated.View>
      ))}
      <View>
        {children}
        {waiting > 0 ? (
          <View
            testID={testID ? `${testID}-badge` : undefined}
            pointerEvents="none"
            style={styles.badge}
          >
            <NumericText value={waiting} prefix="+" style={styles.badgeLabel} />
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  depthSlot: {
    position: 'absolute',
  },
  depthCard: {
    flex: 1,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    shadowColor: '#000000',
    shadowOpacity: 0.09,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 1,
  },
  badge: {
    position: 'absolute',
    top: -spacing.xs,
    right: -spacing.xxs,
    minWidth: 22,
    paddingHorizontal: spacing.xs + spacing.xxs,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    backgroundColor: colors.blueBase,
    alignItems: 'center',
    elevation: 3,
  },
  badgeLabel: {
    ...beVietnamPro(12),
    color: colors.white,
  },
});
