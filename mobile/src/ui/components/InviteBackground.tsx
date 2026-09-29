/**
 * Full-screen `Assets.xcassets/background/inviteBackground` — the sky raster iOS draws behind
 * the trip-invitation and receive-friend-request modals. The SVG's overlay gradient is re-applied
 * on top (see `images.friends.inviteBackground`).
 */
import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet } from 'react-native';

import { images } from '@/ui/assets';

export function InviteBackground() {
  return (
    <>
      <Image
        source={images.friends.inviteBackground}
        style={styles.background}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      <LinearGradient
        colors={['#F7F7F7', '#F7F7F7', 'rgba(251, 251, 251, 0.25)']}
        locations={[0, 0.545, 1]}
        start={{ x: 0.5, y: 1 }}
        end={{ x: 0.5, y: 0 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
    </>
  );
}

const styles = StyleSheet.create({
  // `scaleY: -1` reproduces the iOS asset's `matrix(1 0 0 -1 0 852)` flip.
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    transform: [{ scaleY: -1 }],
  },
});
