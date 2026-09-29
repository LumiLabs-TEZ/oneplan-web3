/**
 * Horizontal plan picker + "Compare features" link — port of `HorizontalProductPicker`
 * (SubscriptionView.swift:421-698). Card width 239, gap 12, a final-card "peek" of 72 so the
 * previous card stays partially visible, and a dot page indicator below.
 *
 * Mirrors `.scrollTargetBehavior(.viewAligned)` + `.scrollPosition(id:)`: cards snap flush left,
 * and the scroll position and the selection drive each other — swiping selects the card that
 * lands, tapping a card scrolls it into place.
 */
import * as Haptics from 'expo-haptics';
import type { Product, ProductSubscription } from 'expo-iap';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useAppLanguage } from '@/i18n';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { PRODUCT_CARD_WIDTH, ProductCard, SNAPPY_200 } from './ProductCard';

const CARD_GAP = 12;
const STRIDE = PRODUCT_CARD_WIDTH + CARD_GAP;
const HORIZONTAL_PADDING = 10;
const FINAL_CARD_PEEK = 72;
/** Fallback for clearing the programmatic-scroll guard if the target offset is never reported. */
const PROGRAMMATIC_SCROLL_TIMEOUT_MS = 600;

export interface ProductPickerProps {
  products: (ProductSubscription | Product)[];
  selectedSku: string | null;
  onSelect: (sku: string) => void;
  onCompareFeaturesTap: () => void;
  testID?: string;
}

export function ProductPicker({
  products,
  selectedSku,
  onSelect,
  onCompareFeaturesTap,
  testID,
}: ProductPickerProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const listRef = useRef<FlatList<ProductSubscription | Product>>(null);

  const trailingPadding = Math.max(
    HORIZONTAL_PADDING,
    width - PRODUCT_CARD_WIDTH - HORIZONTAL_PADDING - FINAL_CARD_PEEK,
  );

  // One snap offset per card, clamped to the max scroll offset so the last card (which can't
  // reach the leading edge because of the peek) still has a reachable resting position.
  const snapOffsets = useMemo(() => {
    const count = products.length;
    const contentWidth =
      HORIZONTAL_PADDING + count * PRODUCT_CARD_WIDTH + (count - 1) * CARD_GAP + trailingPadding;
    const maxOffset = Math.max(0, contentWidth - width);
    return products.map((_, i) => Math.min(i * STRIDE, maxOffset));
  }, [products, trailingPadding, width]);

  // Index of the card at the current scroll position; tracked in a ref so the scroll handler and
  // the selection effect never feed back into each other.
  const scrollIndexRef = useRef(0);
  // Target index of an in-flight programmatic scroll — scroll-driven selection is paused until it
  // lands, so tapping card 3 doesn't select card 2 on the way.
  const programmaticTargetRef = useRef<number | null>(null);
  const programmaticTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearProgrammatic = useCallback(() => {
    programmaticTargetRef.current = null;
    clearTimeout(programmaticTimerRef.current);
  }, []);
  useEffect(() => clearProgrammatic, [clearProgrammatic]);

  const nearestIndex = (x: number) => {
    let best = 0;
    snapOffsets.forEach((offset, i) => {
      if (Math.abs(offset - x) < Math.abs((snapOffsets[best] ?? 0) - x)) best = i;
    });
    return best;
  };

  const selectedIndex = products.findIndex((p) => p.id === selectedSku);

  // Selection → scroll (tap, or the paywall's default pick arriving with the products).
  useEffect(() => {
    if (selectedIndex < 0 || selectedIndex === scrollIndexRef.current) return;
    scrollIndexRef.current = selectedIndex;
    clearProgrammatic();
    programmaticTargetRef.current = selectedIndex;
    programmaticTimerRef.current = setTimeout(clearProgrammatic, PROGRAMMATIC_SCROLL_TIMEOUT_MS);
    listRef.current?.scrollToOffset({
      offset: snapOffsets[selectedIndex] ?? 0,
      animated: !reduceMotion,
    });
  }, [selectedIndex, snapOffsets, reduceMotion, clearProgrammatic]);

  // Scroll → selection, updated as a card passes the midpoint (like SwiftUI's `scrollPosition`).
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = nearestIndex(e.nativeEvent.contentOffset.x);
    const target = programmaticTargetRef.current;
    if (target !== null) {
      if (Math.abs(e.nativeEvent.contentOffset.x - (snapOffsets[target] ?? 0)) < 1) {
        clearProgrammatic();
      }
      return;
    }
    if (index === scrollIndexRef.current) return;
    scrollIndexRef.current = index;
    const sku = products[index]?.id;
    if (sku && sku !== selectedSku) {
      void Haptics.selectionAsync().catch(() => undefined);
      onSelect(sku);
    }
  };

  const select = (sku: string) => {
    if (sku === selectedSku) return;
    void Haptics.selectionAsync().catch(() => undefined);
    onSelect(sku);
  };

  return (
    <View testID={testID}>
      <FlatList
        ref={listRef}
        horizontal
        data={products}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        snapToOffsets={snapOffsets}
        decelerationRate="fast"
        onScroll={onScroll}
        onScrollBeginDrag={clearProgrammatic}
        scrollEventThrottle={16}
        contentContainerStyle={[
          styles.listContent,
          { paddingLeft: HORIZONTAL_PADDING, paddingRight: trailingPadding },
        ]}
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            selected={selectedSku === item.id}
            onPress={select}
            testID={`paywall-product-${item.id}`}
          />
        )}
      />
      {products.length > 1 ? (
        <View style={styles.dots}>
          {products.map((product) => (
            <PageDot
              key={product.id}
              active={selectedSku === product.id}
              reduceMotion={reduceMotion}
            />
          ))}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        testID="paywall-compare"
        onPress={onCompareFeaturesTap}
        style={styles.compareRow}
      >
        <Text style={styles.compareLabel}>{t('Compare features')}</Text>
      </Pressable>
    </View>
  );
}

function PageDot({ active, reduceMotion }: { active: boolean; reduceMotion: boolean }) {
  const progress = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    const target = active ? 1 : 0;
    progress.value = reduceMotion ? target : withSpring(target, SNAPPY_200);
  }, [active, reduceMotion, progress]);
  const style = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [colors.neutral200, colors.contentB]),
  }));
  return <Animated.View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  listContent: { gap: CARD_GAP, paddingVertical: 5 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  compareRow: { paddingTop: spacing.sm, paddingBottom: spacing.xl, alignItems: 'center' },
  compareLabel: { ...beVietnamPro(15, 'regular'), color: colors.contentB },
});
