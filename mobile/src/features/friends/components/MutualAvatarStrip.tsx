/**
 * Three overlapping 17pt avatars next to the mutual-friend count — port of
 * `FriendRequestMutualAvatarStrip` (`ReceiveFriendRequestView.swift:340`). The avatars are
 * placeholders in the iOS mock too (no mutual-friend avatars come down the wire), so this is
 * locked to three placeholder circles.
 */
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/ui/components';

const AVATAR_SIZE = 17;
const OVERLAP = -9;
const PLACEHOLDER_COUNT = 3;

export interface MutualAvatarStripProps {
  testID?: string;
}

export function MutualAvatarStrip({ testID }: MutualAvatarStripProps) {
  return (
    <View style={styles.row} testID={testID}>
      {Array.from({ length: PLACEHOLDER_COUNT }, (_, index) => (
        <Avatar key={index} size={AVATAR_SIZE} style={index === 0 ? undefined : styles.overlap} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  overlap: { marginLeft: OVERLAP },
});
