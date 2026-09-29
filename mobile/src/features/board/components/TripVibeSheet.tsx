/**
 * Second step of "Generate me a trip" — port of `TripVibeBottomSheet.swift`. The user picks one or
 * more vibes and the AI keeps only the pins that fit; nothing picked ("Surprise me") uses every pin.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle } from 'react-native-reanimated';

import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import type { TripVibe } from '../types';
import { BoardButton, BoardSheet } from './common';
import { SelectionCheck, useSelectionProgress } from './SelectionCheck';

type IconName = keyof typeof Ionicons.glyphMap;

/** Canonical order — also the order sent to the server. SF Symbols mapped to Ionicons. */
export const TRIP_VIBES: readonly {
  vibe: TripVibe;
  title: string;
  subtitle: string;
  icon: IconName;
}[] = [
  {
    vibe: 'FOOD_TOUR',
    title: 'Food tour',
    subtitle: 'Restaurants, cafés, street food',
    icon: 'restaurant-outline',
  },
  {
    vibe: 'LANDMARKS_CULTURE',
    title: 'Landmarks & culture',
    subtitle: 'Sights, museums, temples',
    icon: 'library-outline',
  },
  {
    vibe: 'NATURE_OUTDOORS',
    title: 'Nature & outdoors',
    subtitle: 'Parks, beaches, viewpoints',
    icon: 'leaf-outline',
  },
  {
    vibe: 'NIGHTLIFE',
    title: 'Nightlife',
    subtitle: 'Bars, night markets, live music',
    icon: 'moon-outline',
  },
  {
    vibe: 'SHOPPING',
    title: 'Shopping',
    subtitle: 'Malls, markets, local shops',
    icon: 'bag-handle-outline',
  },
  {
    vibe: 'RELAX_WELLNESS',
    title: 'Relax & wellness',
    subtitle: 'Spas, quiet cafés, slow days',
    icon: 'flower-outline',
  },
];

export function TripVibeSheet({
  selected,
  onConfirm,
  onClose,
}: {
  selected: TripVibe[];
  onConfirm: (vibes: TripVibe[]) => void;
  onClose: () => void;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const [pending, setPending] = useState<ReadonlySet<TripVibe>>(() => new Set(selected));
  // `null` = "Surprise me", which is exclusive with every vibe.
  const select = (vibe: TripVibe | null) => {
    void Haptics.selectionAsync();
    setPending((current) => {
      if (!vibe) return new Set();
      const next = new Set(current);
      if (next.has(vibe)) next.delete(vibe);
      else next.add(vibe);
      return next;
    });
  };
  return (
    <BoardSheet
      title={t("What's the vibe?")}
      height="large"
      stackBehavior="push"
      onClose={onClose}
      footer={
        <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          <BoardButton
            testID="trip-vibe-confirm"
            title={t('Generate trip')}
            onPress={() => onConfirm(TRIP_VIBES.map((o) => o.vibe).filter((v) => pending.has(v)))}
          />
        </View>
      }
    >
      <Text style={styles.subtitle}>
        {t("We'll keep the pins that match and leave the rest on your board.")}
      </Text>
      <View style={{ gap: 8, paddingHorizontal: 6 }}>
        <VibeRow
          testID="trip-vibe-surprise"
          title={t('Surprise me')}
          subtitle={t('Use all my pins')}
          icon="sparkles"
          selected={pending.size === 0}
          onPress={() => select(null)}
        />
        {TRIP_VIBES.map((option) => (
          <VibeRow
            key={option.vibe}
            testID={`trip-vibe-${option.vibe}`}
            title={t(option.title)}
            subtitle={t(option.subtitle)}
            icon={option.icon}
            selected={pending.has(option.vibe)}
            onPress={() => select(option.vibe)}
          />
        ))}
      </View>
    </BoardSheet>
  );
}

function VibeRow({
  title,
  subtitle,
  icon,
  selected,
  onPress,
  testID,
}: {
  title: string;
  subtitle: string;
  icon: IconName;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  const progress = useSelectionProgress(selected);
  const border = useAnimatedStyle(() => ({
    borderColor: interpolateColor(progress.value, [0, 1], ['transparent', colors.blueBase]),
  }));
  const iconCircle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [colors.blueAlpha10, colors.blueBase],
    ),
  }));
  const selectedIcon = useAnimatedStyle(() => ({ opacity: progress.value }));
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ selected }}
      onPress={onPress}
    >
      <Animated.View style={[styles.row, border]}>
        <Animated.View style={[styles.icon, iconCircle]}>
          <Ionicons name={icon} size={16} color={colors.blueBase} />
          {/* White glyph cross-fades over the blue one as the circle fills. */}
          <Animated.View style={[StyleSheet.absoluteFill, styles.center, selectedIcon]}>
            <Ionicons name={icon} size={16} color={colors.white} />
          </Animated.View>
        </Animated.View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          <Text numberOfLines={1} style={styles.rowSubtitle}>
            {subtitle}
          </Text>
        </View>
        <SelectionCheck
          selected={selected}
          borderWidth={1.5}
          stroke={colors.contentL}
          iconSize={16}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    ...beVietnamPro(13),
    color: colors.contentM,
    letterSpacing: -0.65,
    textAlign: 'center',
    marginTop: -12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.white,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1.5,
  },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  title: { ...beVietnamPro(16, 'medium'), letterSpacing: -0.32, color: colors.contentB },
  rowSubtitle: { ...beVietnamPro(13), letterSpacing: -0.26, color: colors.contentM },
});
