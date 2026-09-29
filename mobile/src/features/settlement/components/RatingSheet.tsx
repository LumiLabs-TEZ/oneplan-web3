/**
 * Plan rating sheet — port of `Component/BottomSheet/RatingTripBottomSheet.swift`
 * (fixed 500pt detent, five 37pt gold stars, Continue hands the picked rating back).
 */
import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { AppSheet, type AppSheetRef, Button, CachedImage, DismissButton } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const GOLD = 'rgb(255, 194, 54)';
const STARS = [1, 2, 3, 4, 5];

export interface RatingSheetProps {
  listingName: string;
  placesText: string;
  durationText: string;
  thumbnailUrl?: string | null;
  submitting?: boolean;
  onContinue: (rating: number) => void;
}

export interface RatingSheetRef {
  present: () => void;
  dismiss: () => void;
}

export const RatingSheet = forwardRef<RatingSheetRef, RatingSheetProps>(function RatingSheet(
  { listingName, placesText, durationText, thumbnailUrl, submitting = false, onContinue },
  ref,
) {
  useAppLanguage();
  const { t } = useTranslation();
  const sheetRef = useRef<AppSheetRef>(null);
  const [rating, setRating] = useState(0);

  useImperativeHandle(ref, () => ({
    present: () => sheetRef.current?.present(),
    dismiss: () => sheetRef.current?.dismiss(),
  }));

  return (
    <AppSheet ref={sheetRef} snapPoints={[500]}>
      <View style={styles.container} testID="rating-sheet">
        <View style={styles.header}>
          <DismissButton
            onPress={() => sheetRef.current?.dismiss()}
            accessibilityLabel={t('Close')}
          />
        </View>

        <View style={styles.summary}>
          <View style={styles.thumb}>
            <CachedImage uri={thumbnailUrl} style={styles.thumbImage} />
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {listingName}
          </Text>
          <View style={styles.meta}>
            <Text style={styles.metaText}>{placesText}</Text>
            <View style={styles.dot} />
            <Text style={styles.metaText}>{durationText}</Text>
          </View>
        </View>

        <Text style={styles.prompt}>{t('Rate your experience with this Plan')}</Text>
        <View style={styles.stars}>
          {STARS.map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={`${value}`}
              onPress={() => setRating(value)}
              style={styles.star}
              testID={`rating-star-${value}`}
            >
              <Ionicons name="star" size={37} color={value <= rating ? GOLD : colors.neutral200} />
            </Pressable>
          ))}
        </View>

        <Button
          title={t('Continue')}
          loading={submitting}
          // No rating picked yet → nothing to submit (`onContinue` would POST a 0).
          disabled={rating === 0}
          onPress={() => onContinue(rating)}
          style={styles.continue}
          testID="rating-continue"
        />
      </View>
    </AppSheet>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1, paddingBottom: 40, gap: spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg },
  summary: { alignItems: 'center', gap: spacing.sm },
  thumb: {
    width: 120,
    height: 120,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.neutral100,
  },
  thumbImage: { width: '100%', height: '100%' },
  name: { ...beVietnamPro(20), color: colors.contentB, textAlign: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  metaText: { ...beVietnamPro(12), color: colors.contentM },
  dot: { width: 3.8, height: 3.8, borderRadius: 2, backgroundColor: colors.contentM },
  prompt: {
    ...beVietnamPro(15),
    color: colors.contentB,
    textAlign: 'center',
    letterSpacing: -0.75,
  },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: spacing.md },
  star: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  continue: { marginTop: 'auto', marginHorizontal: spacing.lg },
});
