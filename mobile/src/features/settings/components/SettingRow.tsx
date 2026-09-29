/**
 * One settings row — port of `SettingView.settingRowContent` (SettingView.swift:531). Either a
 * tappable row (chevron disclosure) or a toggle row (the switch handles input, not `onPress`).
 */
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import type { SettingIconSpec } from '@/features/settings/helpers/sections';
import { Spinner } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { SettingIcon } from './SettingIcon';

export interface SettingRowToggle {
  value: boolean;
  onChange: (value: boolean) => void;
}

export interface SettingRowProps {
  icon: SettingIconSpec;
  title: string;
  trailing?: string;
  disclosure?: boolean;
  toggle?: SettingRowToggle;
  destructive?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void;
  testID?: string;
}

export function SettingRow({
  icon,
  title,
  trailing,
  disclosure = false,
  toggle,
  destructive = false,
  disabled = false,
  loading = false,
  onPress,
  testID,
}: SettingRowProps) {
  const content = (
    <View style={styles.row}>
      {loading ? (
        <Spinner style={styles.icon} />
      ) : (
        <View style={styles.icon}>
          <SettingIcon
            icon={icon}
            size={typeof icon === 'string' ? 18 : 24}
            color={destructive && typeof icon === 'string' ? colors.secondary : colors.contentB}
          />
        </View>
      )}
      <Text
        style={[styles.title, destructive && styles.titleDestructive]}
        numberOfLines={1}
        testID={testID ? `${testID}-title` : undefined}
      >
        {title}
      </Text>
      <View style={styles.spacer} />
      {toggle ? (
        <Switch
          value={toggle.value}
          onValueChange={toggle.onChange}
          trackColor={{ true: colors.blueBase }}
          testID={testID ? `${testID}-toggle` : undefined}
        />
      ) : (
        <>
          {trailing ? (
            <Text style={styles.trailing} numberOfLines={1}>
              {trailing}
            </Text>
          ) : null}
          {disclosure ? (
            <View style={styles.disclosure}>
              <Ionicons name="chevron-forward" size={13} color={colors.contentM} />
            </View>
          ) : null}
        </>
      )}
    </View>
  );

  if (toggle) {
    // Not a tappable button — the switch itself handles input (mirrors iOS: toggle rows skip
    // the wrapping `Button`).
    return (
      <View testID={testID} style={disabled && styles.disabled}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || !onPress || loading}
      onPress={onPress}
      testID={testID}
      style={disabled && styles.disabled}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm - 2,
    paddingHorizontal: 10,
    paddingVertical: 14,
  },
  icon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  // Swift: 11pt semibold `chevron.right`, ContentM @ 0.85, in a 24×24 frame.
  disclosure: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.85,
  },
  title: { ...beVietnamPro(14), color: colors.contentB, letterSpacing: -0.28 },
  titleDestructive: { color: colors.secondary },
  spacer: { flex: 1 },
  trailing: { ...beVietnamPro(16, 'medium'), color: colors.contentB, letterSpacing: -0.8 },
  disabled: { opacity: 0.65 },
});
