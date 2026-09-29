/**
 * Port of `Component/Trip/TripTabBar.swift`: a row of text pills. Selected pill =
 * blueAlpha10 fill + blueBase text (radius 28); light impact haptic + spring scale
 * bounce on select; the whole bar drops to 50% opacity and ignores presses when
 * `enabled` is false. Phase 1 additionally lets individual tabs be disabled.
 */
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, type StyleProp, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export type TripTab = 'history' | 'plan' | 'note' | 'members' | 'insight';

/** Display order — mirrors `TripTab.allCases`. */
export const TRIP_TABS: readonly TripTab[] = ['history', 'plan', 'note', 'members', 'insight'];

/** English source keys used by the Swift `localizedTitle`. */
export const TRIP_TAB_TITLE_KEYS: Record<TripTab, string> = {
  history: 'History',
  plan: 'Your plan',
  note: 'Note',
  members: 'Members',
  insight: 'Insight',
};

export interface TripTabBarProps {
  active: TripTab;
  onChange: (tab: TripTab) => void;
  /** `false` (ENDED trips) → 50% opacity, every press ignored. */
  enabled: boolean;
  /** Subset + order of tabs to render. Defaults to all five. */
  availableTabs?: readonly TripTab[];
  /** Tabs rendered at 50% opacity whose presses are ignored (Phase 1 stubs). */
  disabledTabs?: readonly TripTab[];
  style?: StyleProp<ViewStyle>;
}

export function TripTabBar({
  active,
  onChange,
  enabled,
  availableTabs = TRIP_TABS,
  disabledTabs = [],
  style,
}: TripTabBarProps) {
  useAppLanguage();
  const { t } = useTranslation();

  return (
    <View
      style={[styles.bar, !enabled && styles.barDisabled, style]}
      accessibilityRole="tablist"
      testID="trip-tab-bar"
    >
      {availableTabs.map((tab) => (
        <TabPill
          key={tab}
          tab={tab}
          title={t(TRIP_TAB_TITLE_KEYS[tab])}
          selected={enabled && active === tab}
          disabled={!enabled || disabledTabs.includes(tab)}
          onSelect={() => {
            if (active === tab) return;
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
            onChange(tab);
          }}
        />
      ))}
    </View>
  );
}

interface TabPillProps {
  tab: TripTab;
  title: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}

function TabPill({ tab, title, selected, disabled, onSelect }: TabPillProps) {
  const scale = useSharedValue(1);
  const bounce = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const handlePress = () => {
    if (disabled) return;
    scale.set(
      withSequence(
        withSpring(1.08, { damping: 12, stiffness: 400 }),
        withSpring(1, { damping: 12, stiffness: 400 }),
      ),
    );
    onSelect();
  };

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={handlePress}
      testID={`trip-tab-${tab}`}
    >
      <Animated.View
        style={[
          styles.pill,
          selected && styles.pillSelected,
          disabled && styles.pillDisabled,
          bounce,
        ]}
      >
        <Text
          style={[styles.title, selected && styles.titleSelected]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {title}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    // Spread the pills edge to edge so the row is centred and fills its width.
    justifyContent: 'space-between',
    gap: 4,
    paddingVertical: 12,
    alignSelf: 'stretch',
  },
  barDisabled: { opacity: 0.5 },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 28,
    backgroundColor: 'transparent',
  },
  pillSelected: { backgroundColor: colors.blueAlpha10 },
  pillDisabled: { opacity: 0.5 },
  title: { ...beVietnamPro(15), color: colors.contentL, letterSpacing: -0.5 },
  titleSelected: { ...beVietnamPro(15, 'medium'), color: colors.blueBase },
});
