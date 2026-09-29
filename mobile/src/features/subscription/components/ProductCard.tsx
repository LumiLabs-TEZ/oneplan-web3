/**
 * A single plan card in the horizontal picker — port of `HorizontalProductPicker`'s card body
 * (SubscriptionView.swift:448-559): name + price row, a hairline divider, the daily-price row, a
 * selection checkmark. Selection animates like the native `.snappy(duration: 0.2)`: the card scales
 * to 1.04x, the border fades in and the checkmark scales up from 0.9 while fading in.
 */
import type { Product, ProductSubscription } from 'expo-iap';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { productPriceLabel, skuNameLabel } from '@/features/subscription/helpers/paywall';
import { useAppLanguage } from '@/i18n';
import { dailyPriceLabel, type Translate } from '@/iap';
import { SFSymbol } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export const PRODUCT_CARD_WIDTH = 239;

/** SwiftUI `.snappy(duration: 0.2, extraBounce: 0)` — snappy's base bounce 0.15 ≈ damping 0.85. */
export const SNAPPY_200 = { duration: 200, dampingRatio: 0.85 } as const;

const BORDER_OFF = 'rgba(54, 54, 54, 0)'; // colors.contentB at alpha 0 — `transparent` interpolates via black

export interface ProductCardProps {
  product: ProductSubscription | Product;
  selected: boolean;
  onPress: (sku: string) => void;
  testID?: string;
}

export function ProductCard({ product, selected, onPress, testID }: ProductCardProps) {
  useAppLanguage();
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    const target = selected ? 1 : 0;
    progress.value = reduceMotion ? target : withSpring(target, SNAPPY_200);
  }, [selected, reduceMotion, progress]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.04 * progress.value }],
    borderColor: interpolateColor(progress.value, [0, 1], [BORDER_OFF, colors.contentB]),
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.9 + 0.1 * progress.value }],
  }));

  return (
    <Animated.View style={[styles.card, cardStyle, selected && styles.cardSelected]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        testID={testID}
        onPress={() => onPress(product.id)}
        style={styles.pressable}
      >
        <View style={styles.top}>
          <View style={styles.nameCol}>
            <Text style={styles.name} numberOfLines={1}>
              {cardName(product, t)}
            </Text>
            <Text style={styles.price} numberOfLines={1}>
              {productPriceLabel(product, t)}
            </Text>
          </View>
          <Animated.View style={[styles.check, checkStyle]}>
            <SFSymbol
              name="checkmark.circle.fill"
              fallback="checkmark-circle"
              size={20}
              color={colors.contentB}
            />
          </Animated.View>
        </View>
        <View style={styles.divider} />
        <View style={styles.bottom}>
          <Text style={styles.daily} numberOfLines={1}>
            {dailyPriceLabel(product, i18n.language, t)}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * iOS shows the App Store `displayName` (e.g. "Best value" for the yearly plan), like
 * `HorizontalProductPicker.displayName(for:)`; Play product names aren't curated, so Android
 * keeps the SKU label.
 */
function cardName(product: ProductSubscription | Product, t: Translate): string {
  const name = 'displayNameIOS' in product ? product.displayNameIOS?.trim() : '';
  return name || skuNameLabel(product.id, t);
}

const styles = StyleSheet.create({
  card: {
    width: PRODUCT_CARD_WIDTH,
    height: 131,
    backgroundColor: colors.neutral50,
    borderRadius: radius.xl,
    borderWidth: 2,
  },
  cardSelected: { zIndex: 1 },
  pressable: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
    paddingHorizontal: 15,
    height: 87,
  },
  nameCol: { gap: 4, flexShrink: 1 },
  name: { ...beVietnamPro(16, 'semibold'), letterSpacing: -0.48, color: colors.contentB },
  price: { ...beVietnamPro(14, 'regular'), letterSpacing: -0.42, color: colors.contentB },
  check: { width: 20, height: 20 },
  divider: { height: 1, backgroundColor: colors.neutral200 },
  bottom: { paddingHorizontal: 15, paddingTop: 10, paddingBottom: 14 },
  daily: { ...beVietnamPro(14, 'regular'), letterSpacing: -0.42, color: colors.contentM },
});
