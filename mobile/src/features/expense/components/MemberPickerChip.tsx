/**
 * Stacked avatar-or-group chip for the "Paid by" / "Share with" / "Who's contributing" rows —
 * port of `ios/OnePlan/OnePlan/Component/Common/MemberPickerChip.swift`: a 36pt circle with a
 * 2pt accent ring when selected, the name underneath. The rows differ only in accent: payer
 * chips are orange (`warning500`), share / contributor chips blue (`blueBase`).
 */
import { Pressable, StyleSheet, type StyleProp, Text, View, type ViewStyle } from 'react-native';

import type { components } from '@/api/schema';
import { Avatar, SFSymbol } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

type TripMemberDto = components['schemas']['TripMemberDto'];

export type MemberPickerAccent = 'blue' | 'orange';

export interface MemberPickerChipProps {
  /** Omit for the aggregate "All" / "Group" chip (renders a group glyph instead of an avatar). */
  member?: TripMemberDto;
  /**
   * Avatar source when there is no full `TripMemberDto` to pass — e.g. the vault expense sheet's
   * "Me" chip, built from a `UserProfileDto`. Ignored when `member` is given. `undefined` (vs.
   * `null`) still falls back to the group glyph, matching the no-`member` default.
   */
  avatarUrl?: string | null;
  /** Overrides `member.displayName`; required when `member` is omitted. */
  label?: string;
  selected: boolean;
  accent: MemberPickerAccent;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const BADGE_SIZE = 36;
const RING_WIDTH = 2;

const ACCENT = {
  blue: colors.blueBase,
  orange: colors.warning500,
} as const;

export function MemberPickerChip({
  member,
  avatarUrl,
  label,
  selected,
  accent,
  onPress,
  disabled = false,
  style,
  testID,
}: MemberPickerChipProps) {
  const color = ACCENT[accent];
  const title = label ?? member?.displayName ?? '';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={styles.badge}>
        {member ? (
          <Avatar uri={member.avatarUrl} size={BADGE_SIZE} />
        ) : avatarUrl !== undefined ? (
          <Avatar uri={avatarUrl} size={BADGE_SIZE} />
        ) : (
          <View style={styles.groupBadge}>
            <SFSymbol
              name="person.3.fill"
              fallback="people"
              size={14}
              frame={24}
              weight="600"
              color={colors.white}
            />
          </View>
        )}
        {/* Drawn over the badge like SwiftUI's `.overlay { Circle().stroke(...) }`. */}
        <View
          pointerEvents="none"
          style={[styles.ring, { borderColor: selected ? color : 'transparent' }]}
          testID={testID ? `${testID}-ring` : undefined}
        />
      </View>
      <Text
        style={[styles.title, { color: selected ? color : colors.contentM }]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { alignItems: 'center', gap: 5 },
  badge: { width: BADGE_SIZE, height: BADGE_SIZE },
  groupBadge: {
    // `.padding(2)` inside the ring.
    margin: 2,
    flex: 1,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    ...StyleSheet.absoluteFill,
    borderRadius: BADGE_SIZE / 2,
    borderWidth: RING_WIDTH,
  },
  title: { ...beVietnamPro(14), letterSpacing: -0.28, width: 52, textAlign: 'center' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
