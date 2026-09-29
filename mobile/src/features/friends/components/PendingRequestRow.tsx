/** Port of `FriendsListView.pendingRequestRow` (`FriendsListView.swift:101-136`). */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface PendingRequestRowProps {
  name: string;
  avatarUrl?: string | null;
  subtitle: string;
  onPress?: () => void;
  testID?: string;
}

export function PendingRequestRow({
  name,
  avatarUrl,
  subtitle,
  onPress,
  testID,
}: PendingRequestRowProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} testID={testID} style={styles.row}>
      <Avatar uri={avatarUrl} size={42} />
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  text: { flex: 1, gap: 2 },
  name: { ...beVietnamPro(14, 'medium'), color: colors.contentB },
  subtitle: { ...beVietnamPro(14), color: colors.contentM },
});
