/**
 * History tab of the trip-end screen — port of `View/Trip/TripEnd/TripEndHistory.swift`:
 * the status-less hero, the shared-album download card, the Trip Plan share/rate card and
 * the same grouped history list the trip detail uses.
 *
 * Split for the screen's `FlashList`: `TripEndHistoryHeader` (hero, cards, "History" title)
 * rides in the list header, the history rows are the list data (`HistoryListRow`), and
 * `TripEndRatingSheet` sits outside the list.
 */
import { useRouter } from 'expo-router';
import { type RefObject, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';

import { useSubmitRating } from '@/features/market/api/ratings';
import { downloadAll } from '@/features/photos/downloadAll';
import { durationDays } from '@/features/settlement/helpers/settlementModel';
import { usePlanItems } from '@/features/trip/api/queries';
import type { TripDto, TripPhotoDto } from '@/features/trip/types';
import { useAppLanguage } from '@/i18n';
import type { Currency } from '@/lib/currency';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { RatingSheet, type RatingSheetRef } from './RatingSheet';
import { type DownloadState, SharedAlbumCard } from './SharedAlbumCard';
import { TripEndHeroHeader } from './TripEndHeroHeader';
import { TripPlanCard } from './TripPlanCard';

export interface TripEndHistoryHeaderProps {
  tripId: number;
  trip: TripDto | undefined;
  currency: Currency;
  totalSpent: number;
  /** The WHOLE album (see `useAllTripPhotos`), not just the first page. */
  photos: readonly TripPhotoDto[];
  /** Still paging the album in — the count/total are provisional, so hold the download. */
  photosDraining: boolean;
  /** The "History" title — only when there are rows under it. */
  showHistoryTitle: boolean;
  /** Rating just submitted here, shown until the refetched trip carries it. */
  localRating: number | null;
  onRate: () => void;
}

/** Everything above the history rows. */
export function TripEndHistoryHeader({
  tripId,
  trip,
  currency,
  totalSpent,
  photos,
  photosDraining,
  showHistoryTitle,
  localRating,
  onRate,
}: TripEndHistoryHeaderProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const router = useRouter();
  const [download, setDownload] = useState<DownloadState>({ kind: 'idle' });

  const listingId = trip?.marketplaceListingId ?? null;

  const handleDownload = async () => {
    setDownload({ kind: 'downloading', done: 0, total: photos.length });
    const result = await downloadAll(tripId, {
      onProgress: (done, total) => setDownload({ kind: 'downloading', done, total }),
    });
    if (result.status === 'success') {
      setDownload({ kind: 'done', saved: result.saved });
      return;
    }
    setDownload({ kind: 'idle' });
    if (result.status === 'permissionDenied') {
      Alert.alert(
        t('Photo Library Access'),
        t(
          'OnePlan needs permission to save photos to your camera roll. Please enable it in Settings.',
        ),
        [
          { text: t('Cancel'), style: 'cancel' },
          { text: t('Open Settings'), onPress: () => void Linking.openSettings() },
        ],
      );
    } else {
      // `result.message` is a raw network/SDK string — show a translated body instead.
      Alert.alert(t('Download failed'), t('Please try again'));
    }
  };

  const hasCoordinates = trip?.location?.latitude != null && trip?.location?.longitude != null;

  return (
    <View style={styles.root}>
      <TripEndHeroHeader
        coverImageUrl={trip?.coverImageUrl}
        totalSpent={totalSpent}
        unsettledCount={0}
        currency={currency}
        showStatus={false}
      />

      <View style={styles.body}>
        {photos.length > 0 ? (
          <SharedAlbumCard
            photoCount={photos.length}
            previews={photos.slice(0, 3).map((p) => p.url)}
            state={download}
            disabled={photosDraining}
            onDownload={() => void handleDownload()}
          />
        ) : null}

        {hasCoordinates ? (
          <TripPlanCard
            coverImageUrl={trip?.coverImageUrl}
            listingId={listingId}
            userRating={localRating ?? trip?.userMarketplaceRating}
            onShare={() =>
              router.push({ pathname: '/market/editor', params: { tripId: String(tripId) } })
            }
            onRate={onRate}
          />
        ) : null}

        {/* The rows follow in the screen's list, `spacing.sm` below (`historyTitleGap`).
            Read-only there: iOS' trip-end history has no row navigation. */}
        {showHistoryTitle ? <Text style={styles.historyTitle}>{t('History')}</Text> : null}
      </View>
    </View>
  );
}

/** Gap between the "History" title and the first history row. */
export const historyTitleGap = spacing.sm;
/** Side inset of the history rows, matching the cards above them. */
export const historyRowInset = spacing.lg;

export interface TripEndRatingSheetProps {
  sheetRef: RefObject<RatingSheetRef | null>;
  tripId: number;
  trip: TripDto | undefined;
  /** A rating was saved — the header shows it right away. */
  onRated: (rating: number) => void;
}

/** The Trip Plan card's rate sheet; lives outside the scrolling list. */
export function TripEndRatingSheet({ sheetRef, tripId, trip, onRated }: TripEndRatingSheetProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const planItems = usePlanItems(tripId);
  const listingId = trip?.marketplaceListingId ?? null;
  const submitRating = useSubmitRating(listingId ?? 0, tripId);

  const handleRate = (rating: number) => {
    sheetRef.current?.dismiss();
    if (listingId == null || rating <= 0) return;
    submitRating.mutate(rating, {
      onSuccess: () => onRated(rating),
      onError: () => Alert.alert(t('Rating failed'), t('Please try again')),
    });
  };

  const days = durationDays(trip, planItems.data ?? []);

  return (
    <RatingSheet
      ref={sheetRef}
      listingName={trip?.name ?? ''}
      placesText={t('%lld places', { count: planItems.data?.length ?? 0 })}
      durationText={t('%lld days', { count: days })}
      thumbnailUrl={trip?.coverImageUrl}
      submitting={submitRating.isPending}
      onContinue={handleRate}
    />
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xl },
  body: { paddingHorizontal: spacing.lg, gap: spacing.xl },
  historyTitle: { ...beVietnamPro(16, 'medium'), color: colors.contentM },
});
