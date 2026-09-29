/**
 * Search-provider attribution (`PlaceSearchProvider.attribution`), pinned to the top-right of the
 * screen, vertically centered on the header's back button row. Hidden in detail content (only
 * rendered by the screen while search content is showing) and hidden entirely when the provider
 * requires no attribution (`null`).
 */
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface PoweredByProps {
  attribution: string | null;
  testID?: string;
}

/** `LocationHeader`'s row: 8pt below the safe area, 45pt glass button. */
const HEADER_TOP_GAP = 8;
const HEADER_BUTTON_SIZE = 45;

export function PoweredBy({ attribution, testID }: PoweredByProps) {
  const insets = useSafeAreaInsets();
  if (!attribution) return null;
  return (
    <View
      style={[styles.root, { top: insets.top + HEADER_TOP_GAP, height: HEADER_BUTTON_SIZE }]}
      pointerEvents="none"
      testID={testID}
    >
      <Text style={styles.text}>{attribution}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', right: spacing.lg, justifyContent: 'center' },
  text: {
    ...beVietnamPro(11),
    color: colors.contentM,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
});
