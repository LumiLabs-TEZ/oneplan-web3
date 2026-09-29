/**
 * Small round avatar with an initials fallback — shared by the end-trip consensus / settlement
 * rows (`TripEndReviewView.avatar`, `VaultSettlementRow.avatar` on `feat/web3-version`), which
 * both fall back to a circle showing the counterparty's first initial rather than the generic
 * silhouette `@/ui/components/Avatar` uses.
 */
import { StyleSheet, Text, View } from 'react-native';

import { CachedImage } from '@/ui/components/CachedImage';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface PersonAvatarProps {
  uri?: string | null;
  name: string;
  size: number;
  testID?: string;
}

export function PersonAvatar({ uri, name, size, testID }: PersonAvatarProps) {
  const frame = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[styles.frame, frame]} testID={testID}>
      <CachedImage
        uri={uri}
        style={frame}
        placeholder={<InitialsCircle name={name} size={size} />}
      />
    </View>
  );
}

function InitialsCircle({ name, size }: { name: string; size: number }) {
  const frame = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[styles.initials, frame]}>
      <Text style={[beVietnamPro(size > 40 ? 18 : 11), styles.initialsText]}>
        {name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: colors.neutral200 },
  initials: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.neutral200 },
  initialsText: { color: colors.contentM },
});
