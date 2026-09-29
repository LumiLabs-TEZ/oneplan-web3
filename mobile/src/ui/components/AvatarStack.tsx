import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';

import { Avatar } from '@/ui/components/Avatar';
import { NumericText } from '@/ui/components/NumericText';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface AvatarStackMember {
  id: number;
  avatarUrl?: string | null;
}

export interface AvatarStackProps {
  members: readonly AvatarStackMember[];
  /** Avatars shown before collapsing into "+N". */
  max?: number;
  size?: number;
  /** Horizontal distance between consecutive avatar origins (overlap = size - step). */
  step?: number;
  onAddPress?: () => void;
  /** 1pt surface ring around each avatar. The iOS OngoingCard draws none. */
  avatarBorder?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Port of the member row in `Component/Card/OngoingCard.swift:11-13, 113-148`. */
export function AvatarStack({
  members,
  max = 3,
  size = 23.84,
  step = 11.22,
  onAddPress,
  avatarBorder = true,
  style,
}: AvatarStackProps) {
  const shown = members.slice(0, max);
  const remaining = Math.max(members.length - max, 0);
  const overlap = step - size;
  const chipFrame = { width: size, height: size, borderRadius: size / 2 };

  return (
    <View style={[styles.row, style]}>
      <View style={styles.avatars}>
        {shown.map((member, index) => (
          <View
            key={member.id}
            style={[
              styles.avatarSlot,
              avatarBorder && styles.avatarRing,
              index > 0 && { marginLeft: overlap },
            ]}
            testID="avatar-stack-item"
          >
            <Avatar uri={member.avatarUrl} size={size} />
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={!onAddPress}
        onPress={onAddPress}
        style={[styles.addChip, chipFrame]}
        testID="avatar-stack-add"
      >
        {/* SF Symbol `plus` in a 16pt frame (OngoingCard.swift:123-125). */}
        <Ionicons name="add" size={16} color={colors.blueBase} testID="avatar-stack-add-icon" />
      </Pressable>

      {remaining > 0 ? (
        <NumericText
          value={remaining}
          prefix="+"
          style={styles.remaining}
          testID="avatar-stack-remaining"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  avatarSlot: { borderRadius: 999 },
  avatarRing: { borderWidth: 1, borderColor: colors.surface },
  addChip: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blueAlpha10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.blueBase,
  },
  remaining: { ...beVietnamPro(14), color: colors.contentB },
});
