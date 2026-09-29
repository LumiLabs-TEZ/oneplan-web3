/**
 * Stand-in for a `MapView` when `isMapAvailable()` is false (build without a Google Maps
 * key for the platform). Icon-only so it needs no new i18n strings.
 */
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '@/ui/theme';

export function MapUnavailable({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.root, style]} testID="map-unavailable">
      <Ionicons name="map-outline" size={32} color={colors.neutral400} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral100,
  },
});
