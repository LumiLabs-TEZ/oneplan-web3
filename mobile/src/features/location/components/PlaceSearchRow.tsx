/**
 * One search-result row: 32pt tile + title/subtitle, with a divider inset under the text. Port of
 * `searchResultsList`'s row (`ios/OnePlan/OnePlan/Component/BottomSheet/ChooseLocationView.swift`),
 * except the tile shows the place's category illustration (Foursquare category → our expense
 * categories) and only falls back to the app logo when the category is unknown.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { svg } from '@/ui/assets';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { matchedCategoryIllustrationKey } from '../helpers/categoryIllustration';

export interface PlaceSearchRowInfo {
  name: string;
  address: string | null;
  /** Free-text POI category (`PlacePrediction.category`); `null` → app logo. */
  category?: string | null;
}

export interface PlaceSearchRowProps {
  place: PlaceSearchRowInfo;
  onPress: () => void;
  testID?: string;
}

const LOGO_SIZE = 32;

export function PlaceSearchRow({ place, onPress, testID }: PlaceSearchRowProps) {
  const key = matchedCategoryIllustrationKey(place.category ?? null);
  const Logo = key ? svg.categories[key] : svg.illustration.appLogoCutout;
  return (
    <View>
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.row} testID={testID}>
        <View style={styles.logo}>
          <Logo width={LOGO_SIZE} height={LOGO_SIZE} preserveAspectRatio="xMidYMid slice" />
        </View>
        <View style={styles.text}>
          <Text style={styles.name} numberOfLines={1}>
            {place.name}
          </Text>
          {place.address ? (
            <Text style={styles.address} numberOfLines={1}>
              {place.address}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: 8, overflow: 'hidden' },
  text: { flex: 1, gap: 2 },
  name: { ...beVietnamPro(14), color: colors.contentB },
  address: { ...beVietnamPro(14), color: colors.contentM },
  divider: { height: 1, marginLeft: 48, backgroundColor: colors.dividerStroke },
});
