/**
 * The neutral50 features card — port of `PaywallView`'s points list (SubscriptionView.swift:36-56)
 * with the `AnimatedPointView` entrance (:702-767): each row's icon pops in (`.blurReplace`,
 * approximated as fade + scale), then its title slides in from the left and the quota from the
 * right, each clipped to its own frame. Rows stagger 400ms apart, the text a further `i·100ms`.
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { PAYWALL_POINTS, type PaywallPoint } from '@/features/subscription/helpers/paywall';
import { videoQuotaLabel } from '@/iap';
import { useAppLanguage } from '@/i18n';
import { SFSymbol } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface PaywallPointsProps {
  /** Selected SKU, used to resolve the scan-quota label shown next to the video point. */
  selectedSku: string | null;
  points?: PaywallPoint[];
  testID?: string;
}

const INITIAL_DELAY_MS = 100;
const ROW_STAGGER_MS = 400;
const CONTENT_STAGGER_MS = 100;
/** SwiftUI `.snappy(duration: 0.3, extraBounce: 0)`. */
const SNAPPY_300 = { duration: 300, dampingRatio: 0.85 } as const;
/** SwiftUI `.easeInOut(duration: 0.25)`. */
const CONTENT_TIMING = { duration: 250, easing: Easing.inOut(Easing.ease) } as const;

export function PaywallPoints({
  selectedSku,
  points = PAYWALL_POINTS,
  testID,
}: PaywallPointsProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.3;

  return (
    <View style={styles.card} testID={testID}>
      {points.map((point, index) => (
        <AnimatedPointRow
          key={point.title}
          index={index}
          point={point}
          title={t(point.title)}
          quota={point.showsVideoQuota ? videoQuotaLabel(selectedSku ?? '', t) : null}
          stacked={stacked}
        />
      ))}
    </View>
  );
}

interface AnimatedPointRowProps {
  index: number;
  point: PaywallPoint;
  title: string;
  quota: string | null;
  stacked: boolean;
}

function AnimatedPointRow({ index, point, title, quota, stacked }: AnimatedPointRowProps) {
  const reduceMotion = useReducedMotion();
  const symbol = useSharedValue(reduceMotion ? 1 : 0);
  const content = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      symbol.value = 1;
      content.value = 1;
      return;
    }
    const symbolDelay = INITIAL_DELAY_MS + index * ROW_STAGGER_MS;
    symbol.value = withDelay(symbolDelay, withSpring(1, SNAPPY_300));
    content.value = withDelay(
      symbolDelay + index * CONTENT_STAGGER_MS,
      withTiming(1, CONTENT_TIMING),
    );
    // Entrance only — runs once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const symbolStyle = useAnimatedStyle(() => ({
    opacity: symbol.value,
    transform: [{ scale: 0.6 + 0.4 * symbol.value }],
  }));

  return (
    <View style={[styles.row, stacked && styles.rowStacked]}>
      <Animated.View style={[styles.icon, symbolStyle]}>
        <SFSymbol
          name={point.sf}
          fallback={point.fallback as never}
          size={16}
          frame={20}
          weight="600"
          color={colors.black}
        />
      </Animated.View>
      <SlideInText
        progress={content}
        from="leading"
        style={styles.title}
        clipStyle={styles.titleClip}
      >
        {title}
      </SlideInText>
      {quota !== null ? (
        <SlideInText
          progress={content}
          from="trailing"
          style={styles.quota}
          clipStyle={[styles.quotaClip, stacked && styles.quotaClipStacked]}
        >
          {quota}
        </SlideInText>
      ) : null}
    </View>
  );
}

/** Text that slides in by its own width from one side, clipped (`visualEffect` + `.clipped()`). */
function SlideInText({
  progress,
  from,
  style,
  clipStyle,
  children,
}: {
  progress: SharedValue<number>;
  from: 'leading' | 'trailing';
  style: StyleProp<TextStyle>;
  clipStyle: StyleProp<ViewStyle>;
  children: string;
}) {
  const width = useSharedValue(0);
  const onLayout = (e: LayoutChangeEvent) => {
    width.value = e.nativeEvent.layout.width;
  };
  const animatedStyle = useAnimatedStyle(() => {
    const hidden = (1 - progress.value) * width.value;
    return {
      opacity: progress.value,
      transform: [{ translateX: from === 'leading' ? -hidden : hidden }],
    };
  });
  return (
    <View style={[styles.clip, clipStyle]}>
      <Animated.Text numberOfLines={1} onLayout={onLayout} style={[style, animatedStyle]}>
        {children}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.neutral50,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowStacked: { flexDirection: 'column', alignItems: 'flex-start' },
  icon: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  clip: { overflow: 'hidden' },
  titleClip: { flexShrink: 1 },
  quotaClip: { marginLeft: 'auto', flexShrink: 0 },
  quotaClipStacked: { marginLeft: 0 },
  title: {
    ...beVietnamPro(15, 'regular'),
    letterSpacing: -0.45,
    color: colors.contentB,
  },
  quota: {
    ...beVietnamPro(15, 'regular'),
    letterSpacing: -0.45,
    color: colors.contentM,
  },
});
