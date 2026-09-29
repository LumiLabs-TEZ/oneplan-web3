/**
 * Horizontal strip of 116pt location cards — the "Recently viewed" and "Suggested for you"
 * sections of the location-search sheet's empty state. Port of `locationSection` /
 * `locationCard` in `ChooseLocationView.swift`: a category illustration filling a rounded tile
 * (`appLogoCutout` when the category is unknown), then a 2-line name + 2-line address.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { svg } from '@/ui/assets';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { matchedCategoryIllustrationKey } from '../helpers/categoryIllustration';

export interface LocationCardItem {
  key: string;
  name: string;
  address: string | null;
  category: string | null;
}

export interface LocationCardStripProps {
  items: readonly LocationCardItem[];
  onSelect: (index: number) => void;
  /** Per-card testIDs are `${cardTestIDPrefix}-${index}`. */
  cardTestIDPrefix?: string;
  testID?: string;
}

const CARD_SIZE = 116;

function CardArtwork({ category }: { category: string | null }) {
  const key = matchedCategoryIllustrationKey(category);
  const Illustration = key ? svg.categories[key] : svg.illustration.appLogoCutout;
  return <Illustration width={CARD_SIZE} height={CARD_SIZE} preserveAspectRatio="xMidYMid slice" />;
}

export function LocationCardStrip({
  items,
  onSelect,
  cardTestIDPrefix,
  testID,
}: LocationCardStripProps) {
  if (items.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // iOS `.scrollClipDisabled()` — cards scroll out to the sheet edge, not the section inset.
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      testID={testID}
    >
      {items.map((item, index) => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          accessibilityLabel={item.address ? `${item.name}, ${item.address}` : item.name}
          onPress={() => onSelect(index)}
          style={styles.card}
          testID={cardTestIDPrefix ? `${cardTestIDPrefix}-${index}` : undefined}
        >
          <View style={styles.tile}>
            <CardArtwork category={item.category} />
          </View>
          <View style={styles.text}>
            <Text style={styles.name} numberOfLines={2}>
              {item.name}
            </Text>
            {item.address ? (
              <Text style={styles.address} numberOfLines={2}>
                {item.address}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { marginHorizontal: -12 },
  content: { gap: 8, paddingHorizontal: 12 },
  card: { width: CARD_SIZE, gap: 8 },
  tile: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.neutral50,
  },
  text: { gap: 5 },
  name: { ...beVietnamPro(14), color: colors.contentB },
  address: { ...beVietnamPro(10), color: colors.contentM },
});
