import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';

import { svg } from '@/ui/assets';
import { CachedImage } from '@/ui/components/CachedImage';
import { colors } from '@/ui/theme';

const BADGE_SIZE = 14;

export interface AvatarProps {
  uri?: string | null;
  /** Diameter in points. */
  size?: number;
  /** Shows a small blue star badge at the bottom-right — port of `AvatarProPlaceholder`. */
  isPro?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Avatar({ uri, size = 32, isPro = false, style, testID }: AvatarProps) {
  const Placeholder = svg.avatarPlaceholder;
  const frame = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={styles.container}>
      <View style={[styles.frame, frame, style]} testID={testID}>
        <CachedImage
          uri={uri}
          style={frame}
          placeholder={<Placeholder width={size} height={size} testID="avatar-placeholder" />}
        />
      </View>
      {isPro ? (
        <View style={styles.badge} testID="avatar-pro-badge">
          <Ionicons name="star" size={8} color={colors.white} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Plain layout wrapper — never receives `style`/`testID` so it can't shadow the frame's
  // radius/clip. Only exists so the Pro badge can be absolutely positioned against the frame.
  container: { alignSelf: 'flex-start', position: 'relative' },
  frame: { overflow: 'hidden', backgroundColor: colors.neutral100 },
  badge: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: colors.blueBase,
    borderWidth: 1.5,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
