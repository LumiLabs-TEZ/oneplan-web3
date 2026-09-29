/**
 * Shared tab header — port of the `.toolbar` in `MainView.swift:417-489` + `:714-757`.
 * Leading: avatar (32) + display-name glass capsule → Profile (Phase 4 stub).
 * Trailing: home/trip → history clock → `/trips/ended`; market → Request a plan sheet (Pro) +
 * unlocked plans.
 */
import { Ionicons } from '@expo/vector-icons';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { router, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  RequestPlanSheet,
  type RequestPlanSheetRef,
} from '@/features/market/components/RequestPlanSheet';
import { useMe } from '@/features/me/useMe';
import type { AppTab } from '@/features/shell/tabs';
import { useRequirePro } from '@/features/subscription/useRequirePro';
import { useAppLanguage } from '@/i18n';
import { svg } from '@/ui/assets';
import { Avatar } from '@/ui/components/Avatar';
import { GlassSurface } from '@/ui/components/GlassSurface';
import { colors } from '@/ui/theme';

/** `transitionEnd` is emitted by bottom-tabs when the cross-fade animation finishes. */
type TransitionEndNavigation = {
  addListener: (type: 'transitionEnd', listener: () => void) => () => void;
};

export function AppHeader({ tab }: { tab: AppTab }) {
  useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data: me } = useMe();
  const ClockIcon = svg.icons.clock;
  const navigation = useNavigation();
  const liquidGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
  const [glassEpoch, setGlassEpoch] = useState(0);

  // A tab scene mounts (or re-attaches) during the cross-fade, so `expo-glass-effect` can
  // initialise the native material while the scene is still at opacity 0 — the capsules then
  // render blank until the view is recreated (expo/expo#43732 family). Recreate the surfaces
  // once the fade has finished, i.e. while they are actually visible.
  useEffect(() => {
    if (!liquidGlass) return;
    const transitionEndNavigation = navigation as unknown as TransitionEndNavigation;
    return transitionEndNavigation.addListener('transitionEnd', () => {
      setGlassEpoch((epoch) => epoch + 1);
    });
  }, [liquidGlass, navigation]);
  const glassKey = `glass-${glassEpoch}`;

  const openProfile = () => router.push('/profile');
  // `MainView.openRequestPlanFlow`: free users hit the paywall instead of the sheet.
  const { requirePro } = useRequirePro();
  const requestSheet = useRef<RequestPlanSheetRef>(null);

  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <View style={styles.side}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Profile')}
          testID="header-avatar"
          onPress={openProfile}
        >
          <Avatar uri={me?.avatarUrl} size={32} />
        </Pressable>
        {me?.displayName ? (
          <Pressable accessibilityRole="button" style={styles.shadow} onPress={openProfile}>
            <GlassSurface key={glassKey} preset="control" radius={999} style={styles.capsule}>
              <Text style={styles.capsuleText} numberOfLines={1}>
                {me.displayName}
              </Text>
            </GlassSurface>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.side, styles.trailing]}>
        {tab === 'home' || tab === 'trip' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('History')}
            testID="header-history"
            style={styles.shadow}
            onPress={() => router.push('/trips/ended')}
          >
            <GlassSurface key={glassKey} preset="control" radius={999} style={styles.iconButton}>
              <ClockIcon width={20} height={20} />
            </GlassSurface>
          </Pressable>
        ) : null}
        {tab === 'market' ? (
          <>
            <Pressable
              accessibilityRole="button"
              testID="header-request-plan"
              style={styles.shadow}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                requirePro(() => requestSheet.current?.present());
              }}
            >
              <GlassSurface key={glassKey} preset="control" radius={999} style={styles.capsule}>
                <Text style={styles.capsuleText}>{t('Request a plan')}</Text>
              </GlassSurface>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Unlocked')}
              style={styles.shadow}
              onPress={() => router.push('/market/unlocked')}
            >
              <GlassSurface key={glassKey} preset="control" radius={999} style={styles.iconButton}>
                <Ionicons name="bag" size={18} color={colors.contentB} />
              </GlassSurface>
            </Pressable>
            <RequestPlanSheet ref={requestSheet} />
          </>
        ) : null}
      </View>
    </View>
  );
}

/** Row height (the 40pt glass buttons) + `bar` bottom padding. */
const HEADER_ROW_HEIGHT = 40;
const HEADER_BOTTOM_PADDING = 8;

/** Header height every tab pads its content by — the header floats (`headerTransparent`). */
export function useAppHeaderHeight(): number {
  return useSafeAreaInsets().top + HEADER_ROW_HEIGHT + HEADER_BOTTOM_PADDING;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: HEADER_BOTTOM_PADDING,
  },
  // Fixed row height so tabs without a trailing 40pt button (Board) align with the rest.
  side: { flexDirection: 'row', alignItems: 'center', gap: 8, height: HEADER_ROW_HEIGHT },
  trailing: { justifyContent: 'flex-end' },
  capsule: { paddingHorizontal: 12, paddingVertical: 10 },
  capsuleText: { fontSize: 12, fontWeight: '600', color: colors.contentB },
  iconButton: {
    width: HEADER_ROW_HEIGHT,
    height: HEADER_ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadow: { borderRadius: 999, boxShadow: '0px 2px 6px rgba(0,0,0,0.10)' },
});
