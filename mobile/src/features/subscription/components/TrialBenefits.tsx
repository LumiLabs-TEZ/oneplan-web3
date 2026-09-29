import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { CachedImage } from '@/ui/components';
import { useAppLanguage } from '@/i18n';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

interface TrialBenefit {
  symbol: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail?: string;
}

const BENEFITS: TrialBenefit[] = [
  { symbol: 'icloud.and.arrow.up.fill', icon: 'cloud-upload', title: 'Upload plans on market' },
  { symbol: 'location.north.fill', icon: 'navigate', title: 'Unlimited planning trips' },
  { symbol: 'receipt.fill', icon: 'receipt', title: 'Split bill by AI' },
  {
    symbol: 'play.rectangle.fill',
    icon: 'play',
    title: 'Extract pins by video',
    detail: '10 videos/week',
  },
  { symbol: 'signpost.right.fill', icon: 'flag', title: 'Trip insights' },
];

export interface TrialBenefitsProps {
  testID?: string;
}

export function TrialBenefits({ testID }: TrialBenefitsProps) {
  useAppLanguage();
  const { t } = useTranslation();

  return (
    <View style={styles.card} testID={testID}>
      {BENEFITS.map((benefit, index) => (
        <BenefitRow key={benefit.title} benefit={benefit} index={index} translate={t} />
      ))}
    </View>
  );
}

/** Source delays: symbols 100 + index×400ms; text follows index×100ms later. */
function BenefitRow({
  benefit,
  index,
  translate,
}: {
  benefit: TrialBenefit;
  index: number;
  translate: (key: string) => string;
}) {
  const reduced = useReducedMotion();
  const symbol = useSharedValue(reduced ? 1 : 0);
  const content = useSharedValue(reduced ? 1 : 0);
  const titleWidth = useSharedValue(0);
  const detailWidth = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      symbol.value = 1;
      content.value = 1;
    } else {
      symbol.value = withDelay(100 + index * 400, withTiming(1, { duration: 300 }));
      content.value = withDelay(
        100 + index * 500,
        withTiming(1, {
          duration: 250,
          easing: Easing.inOut(Easing.ease),
        }),
      );
    }
    return () => {
      cancelAnimation(symbol);
      cancelAnimation(content);
    };
  }, [content, index, reduced, symbol]);
  const symbolStyle = useAnimatedStyle(() => ({ opacity: symbol.value }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: content.value,
    transform: [{ translateX: (content.value - 1) * titleWidth.value }],
  }));
  const detailStyle = useAnimatedStyle(() => ({
    opacity: content.value,
    transform: [{ translateX: (1 - content.value) * detailWidth.value }],
  }));
  return (
    <View style={styles.row}>
      <Animated.View style={symbolStyle}>
        {Platform.OS === 'ios' ? (
          <CachedImage
            uri={`sf:/${benefit.symbol}`}
            transition={0}
            contentFit="contain"
            style={[
              styles.icon,
              { fontSize: 16, fontWeight: '600', tintColor: colors.contentB, opacity: 0.72 },
            ]}
          />
        ) : (
          <Ionicons
            name={benefit.icon}
            size={16}
            color={colors.contentB}
            style={[styles.icon, { opacity: 0.72 }]}
          />
        )}
      </Animated.View>
      <View
        style={{ overflow: 'hidden', flexShrink: 1 }}
        onLayout={({ nativeEvent }) => {
          titleWidth.value = nativeEvent.layout.width;
        }}
      >
        <Animated.View style={titleStyle}>
          <Text style={styles.title} numberOfLines={1}>
            {translate(benefit.title)}
          </Text>
        </Animated.View>
      </View>
      {benefit.detail ? (
        <View
          style={{ overflow: 'hidden', marginLeft: 'auto' }}
          onLayout={({ nativeEvent }) => {
            detailWidth.value = nativeEvent.layout.width;
          }}
        >
          <Animated.View style={detailStyle}>
            <Text style={styles.detail} numberOfLines={1}>
              {translate(benefit.detail)}
            </Text>
          </Animated.View>
        </View>
      ) : null}
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
  icon: { width: 20, height: 20 },
  title: {
    ...beVietnamPro(15, 'regular'),
    letterSpacing: -0.45,
    color: colors.contentB,
    flexShrink: 1,
  },
  detail: {
    ...beVietnamPro(15, 'regular'),
    letterSpacing: -0.45,
    color: colors.contentM,
  },
});
