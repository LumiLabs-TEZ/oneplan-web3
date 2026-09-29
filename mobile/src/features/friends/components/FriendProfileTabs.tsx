/**
 * Friend-profile tab bar — port of `FriendProfileTabBar` (`FriendProfileView.swift:250-299`):
 * light haptic + a brief scale bounce on the tapped tab, selected tab gets the blue pill fill.
 */
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { useAppLanguage } from '@/i18n';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export type FriendProfileTabValue = 'friends' | 'plans';

export interface FriendProfileTabsProps {
  value: FriendProfileTabValue;
  onChange: (value: FriendProfileTabValue) => void;
  testID?: string;
}

const TABS: { value: FriendProfileTabValue; testIDSuffix: string }[] = [
  { value: 'friends', testIDSuffix: 'friends' },
  { value: 'plans', testIDSuffix: 'plans' },
];

export function FriendProfileTabs({ value, onChange, testID }: FriendProfileTabsProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const labels: Record<FriendProfileTabValue, string> = {
    friends: t('Friends'),
    plans: t('Public plans'),
  };

  return (
    <View style={styles.row} accessibilityRole="tablist" testID={testID}>
      {TABS.map((tab) => (
        <TabButton
          key={tab.value}
          label={labels[tab.value]}
          selected={value === tab.value}
          onPress={() => {
            if (value === tab.value) return;
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
            onChange(tab.value);
          }}
          testID={testID ? `${testID}-${tab.testIDSuffix}` : `friend-tab-${tab.testIDSuffix}`}
        />
      ))}
    </View>
  );
}

function TabButton({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const handlePressIn = () => {
    if (selected) return;
    scale.set(withSpring(1.08, { damping: 10, stiffness: 200 }));
  };
  const handlePressOut = () => {
    scale.set(withSpring(1, { damping: 10, stiffness: 200 }));
  };

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        testID={testID}
        style={[styles.tab, selected && styles.tabSelected]}
      >
        <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'transparent',
  },
  tabSelected: { backgroundColor: colors.blueAlpha10 },
  label: { ...beVietnamPro(16), color: colors.contentL },
  labelSelected: { ...beVietnamPro(16, 'medium'), color: colors.blueBase },
});
