/**
 * Onboarding — port of `ios/OnePlan/OnePlan/View/Onboarding/OnboardingView.swift`.
 * Programmatic horizontal paging over device screenshots (per-slide zoom), a bottom
 * panel with title/subtitle, capsule page indicator (6 → 25) and Continue / Get Started.
 * Native SwiftUI copy on iOS retains the source text blur and spring transition.
 */
import { Ionicons } from '@expo/vector-icons';
import { BlurTargetView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ONBOARDING_ITEMS,
  type OnboardingItem,
  type ZoomAnchor,
} from '@/features/onboarding/items';
import { useAppLanguage } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import { OnboardingCopy } from '@/features/onboarding/OnboardingCopy';
import { OnboardingBackdrop } from '@/features/onboarding/OnboardingBackdrop';
import { Button, CachedImage, GlassIconButton } from '@/ui/components';
import { useTranslation } from 'react-i18next';

const PANEL_HEIGHT = 210;
const SPRING = { duration: 650, dampingRatio: 1 } as const; // ≈ interpolatingSpring(0.65, bounce 0)

function anchorOffset(anchor: ZoomAnchor, scale: number, height: number): number {
  // Scale around top/bottom instead of center by translating after scaling.
  const grown = (height * (scale - 1)) / 2;
  if (anchor === 'top') return grown;
  if (anchor === 'bottom') return -grown;
  return 0;
}

function Slide({ item, width, height }: { item: OnboardingItem; width: number; height: number }) {
  return (
    <View
      style={{
        width,
        height,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: (55 * height) / 844,
        borderCurve: 'continuous',
        overflow: 'hidden',
      }}
    >
      <Image
        source={item.image}
        resizeMode="contain"
        style={{ width, height }}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

function Dot({ active }: { active: boolean }) {
  const w = useSharedValue(active ? 25 : 6);
  useEffect(() => {
    w.value = withSpring(active ? 25 : 6, SPRING);
  }, [active, w]);
  const style = useAnimatedStyle(() => ({ width: w.value }));
  return (
    <Animated.View
      style={[styles.dot, style, { backgroundColor: active ? '#FFFFFF' : 'rgba(255,255,255,0.4)' }]}
    />
  );
}

export default function OnboardingScreen({ onComplete }: { onComplete?: () => void } = {}) {
  useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const setHasSeenOnboarding = useSettingsStore((s) => s.setHasSeenOnboarding);
  const [index, setIndex] = useState(0);
  const backdropRef = useRef<View>(null);
  const listRef = useRef<FlatList<OnboardingItem>>(null);
  const { width: screenW, height: screenH, fontScale } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const panelHeight = fontScale > 1.3 ? 210 + (fontScale - 1) * 64 : PANEL_HEIGHT;
  const availableH = Math.max(120, screenH - insets.top - insets.bottom - 35 - panelHeight - 10);
  const slideH = Math.min(availableH, ((screenW - 60) * 1704) / 786);
  const slideW = (slideH * 786) / 1704;
  const cornerRadius = (55 * slideH) / 844;
  const item = ONBOARDING_ITEMS[index] ?? ONBOARDING_ITEMS[0]!;
  const isLast = index === ONBOARDING_ITEMS.length - 1;

  const scale = useSharedValue(item.zoomScale);
  const translateY = useSharedValue(anchorOffset(item.zoomAnchor, item.zoomScale, slideH));
  useEffect(() => {
    scale.value = reducedMotion ? item.zoomScale : withSpring(item.zoomScale, SPRING);
    translateY.value = reducedMotion
      ? anchorOffset(item.zoomAnchor, item.zoomScale, slideH)
      : withSpring(anchorOffset(item.zoomAnchor, item.zoomScale, slideH), SPRING);
  }, [item, slideH, scale, translateY, reducedMotion]);
  const zoomStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  const go = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, ONBOARDING_ITEMS.length - 1));
      setIndex(clamped);
      listRef.current?.scrollToIndex({ index: clamped, animated: !reducedMotion });
    },
    [reducedMotion],
  );

  const onContinue = () => {
    if (isLast) {
      if (onComplete) onComplete();
      else setHasSeenOnboarding(true);
      return;
    }
    go(index + 1);
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <BlurTargetView ref={backdropRef} style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[
            styles.pager,
            {
              marginTop: insets.top + 35 + (availableH - slideH) / 2 - 10,
              height: slideH + 20,
              width: slideW + 20,
              alignSelf: 'center',
            },
            zoomStyle,
          ]}
        >
          <FlatList
            ref={listRef}
            data={ONBOARDING_ITEMS}
            horizontal
            style={{
              borderRadius: cornerRadius,
              overflow: 'hidden',
              width: slideW,
              height: slideH,
              margin: 10,
              flexGrow: 0,
            }}
            ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
            pagingEnabled
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(i) => String(i.id)}
            getItemLayout={(_, i) => ({ length: slideW + 12, offset: (slideW + 12) * i, index: i })}
            renderItem={({ item: slide }) => <Slide item={slide} width={slideW} height={slideH} />}
          />
          <View
            pointerEvents="none"
            style={[
              styles.bezel,
              { borderRadius: cornerRadius + 3, borderWidth: 6, borderColor: 'white', inset: 0 },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.bezel,
              { borderRadius: cornerRadius + 2, borderWidth: 4, borderColor: 'black', inset: 1 },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.bezel,
              { borderRadius: cornerRadius + 3, borderWidth: 6, borderColor: 'black', inset: 4 },
            ]}
          />
        </Animated.View>
      </BlurTargetView>

      <View style={[styles.panel, { bottom: insets.bottom, height: panelHeight }]}>
        {item.zoomScale > 1 ? (
          <OnboardingBackdrop blurTarget={backdropRef} style={StyleSheet.absoluteFill} />
        ) : null}
        <OnboardingCopy
          items={ONBOARDING_ITEMS.map((slide) => ({
            title: t(slide.title),
            subtitle: slide.subtitle ? t(slide.subtitle) : '',
          }))}
          index={index}
          reducedMotion={reducedMotion}
          style={styles.textBlock}
        />
        <View style={styles.dots}>
          {ONBOARDING_ITEMS.map((s) => (
            <Dot key={s.id} active={s.id === index} />
          ))}
        </View>
        <Button
          variant="primary"
          title={t(isLast ? 'Get Started' : 'Continue')}
          onPress={onContinue}
          style={styles.cta}
          textStyle={{ fontFamily: undefined, fontSize: 16, fontWeight: '400' }}
        />
      </View>

      {index > 0 ? (
        <View style={[styles.back, { top: insets.top + 5 }]}>
          <GlassIconButton
            label={t('Back')}
            onPress={() => go(index - 1)}
            colorScheme="dark"
            blurTarget={backdropRef}
          >
            {Platform.OS === 'ios' ? (
              <CachedImage
                uri="sf:/chevron.left"
                transition={0}
                contentFit="contain"
                style={{ width: 24, height: 24, fontSize: 20, tintColor: '#FFFFFF' }}
              />
            ) : (
              <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
            )}
          </GlassIconButton>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  pager: { overflow: 'visible' },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,

    paddingTop: 20,
    paddingHorizontal: 15,
    gap: 10,
  },
  bezel: { position: 'absolute', borderCurve: 'continuous' },
  textBlock: { flex: 1 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingBottom: 5 },
  dot: { height: 6, borderRadius: 3 },
  cta: { marginHorizontal: 30, height: 48 },
  back: { position: 'absolute', left: 15 },
});
