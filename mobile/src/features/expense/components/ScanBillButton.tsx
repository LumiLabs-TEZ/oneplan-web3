/**
 * "Scan bill" header pill on Add expense — the Pro-gated AI entry point. OnePlan brand blue with a
 * right-side white gradient, a periodic light sweep and a gentle icon pulse so it reads as the headline action,
 * plus a spring press. All idle motion is skipped under Reduce Motion.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useAppLanguage } from '@/i18n';
import { SFSymbol } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const GLOSS = ['rgba(255,255,255,0)', 'rgba(255,255,255,0.4)'] as const;
const SHINE = ['rgba(255,255,255,0)', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0)'] as const;
const SHINE_WIDTH = 36;
const SWEEP_MS = 900;
const SWEEP_PAUSE_MS = 2400;

export interface ScanBillButtonProps {
  onPress: () => void;
}

export function ScanBillButton({ onPress }: ScanBillButtonProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);

  const sweep = useSharedValue(0);
  const pulse = useSharedValue(1);
  const press = useSharedValue(1);

  useEffect(() => {
    if (reduced || width === 0) return;
    sweep.set(
      withRepeat(
        withSequence(
          withTiming(0, { duration: 0 }),
          withDelay(
            SWEEP_PAUSE_MS,
            withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }),
          ),
        ),
        -1,
      ),
    );
    pulse.set(
      withRepeat(
        withSequence(
          withTiming(1.15, { duration: 600, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      ),
    );
    return () => {
      cancelAnimation(sweep);
      cancelAnimation(pulse);
      pulse.set(1);
    };
  }, [reduced, width, sweep, pulse]);

  const shineStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -SHINE_WIDTH + sweep.get() * (width + SHINE_WIDTH * 2) },
      { skewX: '-20deg' },
    ],
  }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.get() }] }));
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.get() }] }));

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={() => press.set(withSpring(0.94, { damping: 15, stiffness: 400 }))}
      onPressOut={() => press.set(withSpring(1, { damping: 12, stiffness: 300 }))}
    >
      <Animated.View style={[styles.shadow, pressStyle]}>
        <View
          style={styles.pill}
          onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        >
          <LinearGradient
            pointerEvents="none"
            colors={GLOSS}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.overlay}
          />
          <Animated.View style={iconStyle}>
            <SFSymbol
              name="doc.text.viewfinder"
              fallback="scan"
              size={15}
              color={colors.white}
              weight="600"
            />
          </Animated.View>
          <Text style={styles.text}>{t('Scan bill')}</Text>
          {!reduced && width > 0 ? (
            <View pointerEvents="none" style={styles.overlay}>
              <Animated.View style={[styles.shine, shineStyle]}>
                <LinearGradient
                  colors={SHINE}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            </View>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: 999,
    shadowColor: colors.blueBase,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: colors.blueBase,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  text: { ...beVietnamPro(15, 'semibold'), letterSpacing: -0.3, color: colors.white },
  overlay: { ...StyleSheet.absoluteFill, borderRadius: 999, overflow: 'hidden' },
  shine: { position: 'absolute', top: -4, bottom: -4, left: 0, width: SHINE_WIDTH },
});
