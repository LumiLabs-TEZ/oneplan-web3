import { ReceiptIcon } from '@/features/receipt/components/ReceiptIcon';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
export function UndoReset({
  hasHistory,
  onUndo,
  onReset,
}: {
  hasHistory: boolean;
  onUndo: () => void;
  onReset: () => void;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const start = useRef<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const progress = useSharedValue(0);
  const visible = useSharedValue(0);
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const cancel = () => {
    clearTimers();
    start.current = null;
    cancelAnimation(progress);
    visible.value = withSpring(0, { duration: 250, dampingRatio: 0.8 });
    progress.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.ease) });
  };
  useEffect(
    () => () => {
      clearTimers();
    },
    [],
  );
  const popupStyle = useAnimatedStyle(() => ({
    opacity: visible.value,
    transform: [{ scale: 0.6 + 0.4 * visible.value }, { translateY: 8 * (1 - visible.value) }],
  }));
  // Slide a full-width fill in with `translateX` rather than animating `width`: layout props
  // commit through the shadow tree and trail the SVG ring, so the two drifted out of sync.
  const popupWidth = useSharedValue(0);
  const sweep = useAnimatedStyle(() => ({
    transform: [{ translateX: -popupWidth.value * (1 - progress.value) }],
  }));
  const ring = useAnimatedProps(() => ({ strokeDashoffset: 56.55 * (1 - progress.value) }));
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Undo')}
        testID="receipt-undo"
        onPressIn={() => {
          if (start.current !== null) return;
          start.current = Date.now();
          timers.current.push(
            setTimeout(() => {
              visible.value = withSpring(1, { duration: 300, dampingRatio: 0.8 });
              progress.value = withTiming(1, { duration: 2000, easing: Easing.linear });
            }, 1000),
          );
          timers.current.push(
            setTimeout(() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onReset();
              cancel();
            }, 3000),
          );
        }}
        onPressOut={() => {
          const wasTap = start.current !== null && Date.now() - start.current < 300;
          cancel();
          if (wasTap) {
            if (hasHistory) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onUndo();
          }
        }}
        style={[pillStyles.pill, hasHistory && pillStyles.active]}
      >
        <ReceiptIcon name="undo" size={11} color={hasHistory ? colors.white : colors.contentM} />
        <Text style={[pillStyles.text, hasHistory && pillStyles.activeText]}>{t('Undo')}</Text>
      </Pressable>
      <Animated.View
        pointerEvents="none"
        style={[styles.popup, popupStyle]}
        testID="receipt-reset-popup"
        onLayout={(event) => {
          popupWidth.value = event.nativeEvent.layout.width;
        }}
      >
        <Animated.View style={[styles.sweep, sweep]} />
        <View style={styles.ring}>
          <Svg width={20} height={20} style={StyleSheet.absoluteFill}>
            <Circle cx={10} cy={10} r={9} stroke="#C7C7C74D" strokeWidth={2} fill="none" />
            <AnimatedCircle
              animatedProps={ring}
              cx={10}
              cy={10}
              r={9}
              stroke={colors.blueBase}
              strokeWidth={2}
              fill="none"
              strokeDasharray="56.55 56.55"
              strokeLinecap="round"
              rotation={-90}
              origin="10,10"
            />
          </Svg>
          <ReceiptIcon name="reset" size={10} color={colors.contentB} />
        </View>
        <Text style={styles.reset}>{t('Reset')}</Text>
      </Animated.View>
    </View>
  );
}
export const pillStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: colors.contentL,
  },
  active: { backgroundColor: colors.blueBase, borderColor: colors.blueBase },
  text: { ...beVietnamPro(14, 'medium'), letterSpacing: -0.6, color: colors.contentM },
  activeText: { color: colors.white },
});
const styles = StyleSheet.create({
  popup: {
    position: 'absolute',
    bottom: 47,
    right: -13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: '#C7C7C74D',
    backgroundColor: colors.surface,
    overflow: 'hidden',
    boxShadow: '0px 2px 16px rgba(0,0,0,0.08)',
  },
  sweep: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#335CFF14',
    borderRadius: 100,
  },
  ring: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  reset: { ...beVietnamPro(14, 'medium'), color: colors.contentB },
});
