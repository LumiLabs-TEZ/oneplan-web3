/**
 * "Trip Plan" card on the trip-end History tab — port of the Trip Plan block of
 * `View/Trip/TripEnd/TripEndHistory.swift` (:192-268). The action is Share (not yet listed),
 * Rate plan (listed, not yet rated) or a disabled `Rated ★ N`.
 *
 * SUBSTITUTIONS: iOS uses the bundled `signpost` artwork (Ionicons stands in) and an orbiting
 * MapKit preview; the map lands in Phase 3, so the trip cover image is shown instead.
 */
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { Button, CachedImage } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface TripPlanCardProps {
  coverImageUrl?: string | null;
  /** Set once the trip's plan has been published to the marketplace. */
  listingId?: number | null;
  /** The current user's rating of that listing, when they already rated it. */
  userRating?: number | null;
  onShare: () => void;
  onRate: () => void;
}

export function TripPlanCard({
  coverImageUrl,
  listingId,
  userRating,
  onShare,
  onRate,
}: TripPlanCardProps) {
  useAppLanguage();
  const { t } = useTranslation();

  const listed = listingId != null;
  const rated = listed && userRating != null;

  return (
    <View style={styles.card} testID="trip-plan-card">
      <View style={styles.header}>
        <View style={styles.icon}>
          <Ionicons name="map-outline" size={28} color={colors.contentM} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('Trip Plan')}</Text>
          <Text style={styles.subtitle}>{t("Share this trip's plan to market")}</Text>
        </View>
        <Button
          title={
            rated ? t('Rated ★ %lld', { 0: userRating }) : listed ? t('Rate plan') : t('Share')
          }
          disabled={rated}
          onPress={listed ? onRate : onShare}
          style={styles.button}
          testID="trip-plan-action"
        />
      </View>

      <View style={styles.preview}>
        <CachedImage uri={coverImageUrl} style={styles.previewImage} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: spacing.sm },
  icon: {
    width: 54,
    height: 54,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral50,
  },
  headerText: { flex: 1, gap: spacing.xs },
  title: { ...beVietnamPro(14), color: colors.contentB },
  subtitle: { ...beVietnamPro(14), color: colors.contentM },
  button: { height: 40, paddingHorizontal: spacing.lg },
  preview: {
    height: 120,
    borderRadius: radius.lg,
    backgroundColor: colors.neutral50,
    overflow: 'hidden',
  },
  previewImage: { width: '100%', height: '100%' },
});
