/**
 * Port of `Component/Home/PopularPlansSection.swift`: "Popular plans" header
 * with a "See all" action above a two-column grid of rotated polaroid covers,
 * each captioned with a compass icon + destination. Data-agnostic — Home
 * passes the admin-featured listings, falling back to trending.
 */
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import Compass from '@/assets/images/board/boardCompassIcon.svg';
import type { FeedItem } from '@/features/market/api/queries';
import { useAppLanguage } from '@/i18n';
import { CachedImage } from '@/ui/components/CachedImage';
import { SectionHeader } from '@/ui/components/SectionHeader';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface PopularPlansSectionProps {
  items: readonly FeedItem[];
  onItemTapped: (item: FeedItem) => void;
  onSeeAll: () => void;
  style?: StyleProp<ViewStyle>;
}

export function PopularPlansSection({
  items,
  onItemTapped,
  onSeeAll,
  style,
}: PopularPlansSectionProps) {
  useAppLanguage();
  const { t } = useTranslation();

  if (items.length === 0) return null;

  return (
    <View style={[styles.section, style]}>
      <SectionHeader
        title={t('Popular plans')}
        action={{ label: t('See all'), onPress: onSeeAll }}
      />
      <View style={styles.grid}>
        {items.map((item, index) => (
          <PopularPlanPolaroid
            key={item.id}
            item={item}
            rotation={index % 2 === 0 ? -2 : 2}
            onPress={() => onItemTapped(item)}
          />
        ))}
      </View>
    </View>
  );
}

interface PopularPlanPolaroidProps {
  item: FeedItem;
  /** Alternating ±2° tilt (`PopularPlansSection.swift:35`). */
  rotation: number;
  onPress: () => void;
}

function PopularPlanPolaroid({ item, rotation, onPress }: PopularPlanPolaroidProps) {
  const caption = item.cityName ?? item.countryName ?? item.name;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={caption}
      onPress={onPress}
      style={styles.polaroid}
      testID={`popular-plan-${item.id}`}
    >
      <View style={[styles.coverWrap, { transform: [{ rotate: `${rotation}deg` }] }]}>
        <CachedImage
          uri={item.coverImageUrl}
          style={styles.cover}
          placeholder={
            // Square center-crop PNG: the 137×176 `defaultTripPlaceholder.svg`
            // (a pattern-wrapped bitmap) renders inset with a white mat in
            // react-native-svg, which iOS never shows.
            <Image
              source={require('@/assets/images/market/defaultTripPlaceholder.png')}
              style={styles.cover}
              contentFit="cover"
            />
          }
        />
        <View pointerEvents="none" style={styles.coverBorder} />
      </View>
      <View style={styles.captionRow}>
        <Compass width={14} height={14} color={colors.contentB} />
        <Text style={styles.caption} numberOfLines={1}>
          {caption}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    columnGap: spacing.lg,
    rowGap: 10,
  },
  polaroid: { width: '47%', gap: spacing.md, paddingTop: spacing.xs },
  coverWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 20,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  // iOS strokes a radius-20 path inset 1.5 with lineWidth 3, so the stroke's
  // outer edge sits exactly on the cover edge (radius 20). RN borders draw
  // inside the view, so inset 0 + radius 20 reproduces it.
  coverBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: colors.neutral100,
  },
  captionRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  caption: {
    ...beVietnamPro(14),
    color: colors.contentB,
    letterSpacing: -0.28,
    flexShrink: 1,
  },
});
