/**
 * Destination row of `MarketplaceSearchbar.swift`: a rotating placeholder city while nothing is
 * picked (offset ±6 + fade, `.smooth(duration: 0.35)`, every 2.2s), a cross-faded selected
 * destination, and an xmark that fades in to clear it. Reduce Motion → fades only, 0.2s.
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useReducedMotion,
  withTiming,
} from 'react-native-reanimated';

import SearchIcon from '@/assets/images/market/locationSearchIcon.svg';
import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const PLACEHOLDER_CITIES = ['London', 'Tokyo', 'Paris', 'New York', 'Singapore', 'Seoul'];
const ROTATE_MS = 2200;
const SMOOTH = Easing.bezier(0.25, 0.1, 0.25, 1);

function randomCity(except?: string) {
  const candidates = PLACEHOLDER_CITIES.filter((city) => city !== except);
  return candidates[Math.floor(Math.random() * candidates.length)] ?? 'London';
}

/** `.offset(y: ±6).combined(with: .opacity)` — slides up into place, leaves upward. */
function slideIn(duration: number) {
  return () => {
    'worklet';
    const config = { duration, easing: SMOOTH };
    return {
      initialValues: { opacity: 0, transform: [{ translateY: 6 }] },
      animations: {
        opacity: withTiming(1, config),
        transform: [{ translateY: withTiming(0, config) }],
      },
    };
  };
}
function slideOut(duration: number) {
  return () => {
    'worklet';
    const config = { duration, easing: SMOOTH };
    return {
      initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
      animations: {
        opacity: withTiming(0, config),
        transform: [{ translateY: withTiming(-6, config) }],
      },
    };
  };
}

export function MarketplaceSearchbar({
  destination,
  placeholder,
  onPress,
  onClear,
}: {
  /** Picked destination label; `undefined` shows the placeholder. */
  destination?: string;
  /** Fixed placeholder (e.g. the source trip's city) — disables the rotation. */
  placeholder?: string;
  onPress: () => void;
  onClear: () => void;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const [city, setCity] = useState(() => randomCity());
  const rotates = !destination && !placeholder;

  useEffect(() => {
    if (!rotates) return;
    const id = setInterval(() => setCity((current) => randomCity(current)), ROTATE_MS);
    return () => clearInterval(id);
  }, [rotates]);

  const duration = reduced ? 200 : 350;
  const fadeIn = FadeIn.duration(duration).easing(SMOOTH);
  const fadeOut = FadeOut.duration(duration).easing(SMOOTH);
  const label = destination ?? placeholder ?? city;

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Destination')}
        accessibilityValue={destination ? { text: destination } : undefined}
        style={styles.button}
        onPress={onPress}
      >
        <SearchIcon width={20} height={20} />
        <View style={styles.labelClip}>
          <Animated.Text
            key={`${destination ? 'selected' : 'placeholder'}-${label}`}
            numberOfLines={1}
            entering={destination || reduced ? fadeIn : slideIn(duration)}
            exiting={destination || reduced ? fadeOut : slideOut(duration)}
            style={[styles.text, { color: destination ? colors.contentB : colors.contentL }]}
          >
            {label}
          </Animated.Text>
        </View>
      </Pressable>
      {destination ? (
        <Animated.View entering={fadeIn} exiting={fadeOut}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Clear search')}
            hitSlop={12}
            testID="market-destination-clear"
            onPress={onClear}
            style={styles.clear}
          >
            <Ionicons name="close" size={16} color={colors.contentB} />
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    /** iOS `MarketplaceSearchbar`: white row on the white card + `shadow(radius: 17.9, 0.09)`. */
    backgroundColor: colors.white,
    borderRadius: 20,
    boxShadow: '0px 0px 18px rgba(0,0,0,0.09)',
  },
  button: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  labelClip: { flex: 1, overflow: 'hidden' },
  text: { ...beVietnamPro(15), letterSpacing: -0.3 },
  clear: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
});
