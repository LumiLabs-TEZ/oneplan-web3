/**
 * Port of `Component/Common/FriendList.swift:81-140`'s row — reused by the profile friends
 * section, the trip invite friends list, and trip member rows.
 */
import { Pressable, StyleSheet, type StyleProp, Text, View, type ViewStyle } from 'react-native';

import { Avatar, ProAvatar } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

/**
 * A `Pressable` with no press handler at all doesn't reliably claim the responder, which
 * would let the tap fall through to an ancestor `Pressable` (e.g. a row's own `onPress`).
 * Always passing a handler — even a no-op for the disabled case — keeps it a dead zone.
 */
function noop() {
  /* no-op: disabled trailing pill swallows the tap */
}

export interface FriendRowTrailing {
  label: string;
  disabled?: boolean;
  onPress?: () => void;
}

export interface FriendRowProps {
  name: string;
  subtitle: string;
  avatarUrl?: string | null;
  isPro?: boolean;
  trailing?: FriendRowTrailing;
  onPress?: () => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function FriendRow({
  name,
  subtitle,
  avatarUrl,
  isPro = false,
  trailing,
  onPress,
  size = 48,
  style,
  testID,
}: FriendRowProps) {
  const content = (
    <>
      {isPro ? <ProAvatar uri={avatarUrl} size={size} /> : <Avatar uri={avatarUrl} size={size} />}
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {trailing ? (
        // Deliberately not `disabled` on the Pressable itself: a disabled RN Pressable
        // declines the responder, so a tap on it would fall through to the row's own
        // `onPress` (the parent claims the responder instead). Keeping it "enabled" with
        // a no-op handler makes it a true dead zone, matching iOS's disabled `Button`.
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: trailing.disabled }}
          onPress={trailing.disabled ? noop : (trailing.onPress ?? noop)}
          testID={testID ? `${testID}-trailing` : undefined}
          style={[
            styles.trailingButton,
            trailing.disabled ? styles.trailingDisabled : styles.trailingEnabled,
          ]}
        >
          <Text
            style={[
              styles.trailingLabel,
              trailing.disabled ? styles.trailingLabelDisabled : styles.trailingLabelEnabled,
            ]}
          >
            {trailing.label}
          </Text>
        </Pressable>
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        testID={testID}
        style={[styles.row, style]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.row, style]} testID={testID}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  text: { flex: 1, gap: 2 },
  name: { ...beVietnamPro(14, 'medium'), color: colors.contentB },
  subtitle: { ...beVietnamPro(12), color: colors.contentM },
  trailingButton: { borderRadius: 999, paddingVertical: spacing.sm },
  trailingEnabled: { backgroundColor: colors.black, paddingHorizontal: spacing.lg },
  trailingDisabled: { backgroundColor: colors.neutral200, paddingHorizontal: spacing.sm },
  trailingLabel: { ...beVietnamPro(14) },
  trailingLabelEnabled: { color: colors.white },
  trailingLabelDisabled: { color: colors.contentM },
});
