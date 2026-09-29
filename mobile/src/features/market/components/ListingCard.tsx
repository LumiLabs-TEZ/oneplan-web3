import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatWhole, fallbackCurrency } from '@/lib/currency';
import { useAppLanguage } from '@/i18n';
import { svg } from '@/ui/assets';
import { Avatar, CachedImage, NumericText } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import type { AcquisitionSummary, FeedItem, Listing } from '../api/queries';
import { rasterIllustration } from '@/ui/components/RasterIllustration';

const DefaultTrip = rasterIllustration(
  require('@/assets/images/market/defaultTripPlaceholderFull.png') as number,
  { width: 137, height: 176 },
);

/**
 * `MarketplaceThumbnailImageHolder.swift`. With `onPress` it is the editable cover of the Upload
 * Trip editor: a neutral fill instead of the default artwork, under a 30% black camera overlay.
 */
export function MarketThumbnail({
  uri,
  size = 72,
  onPress,
  testID,
}: {
  uri?: string | null;
  size?: number;
  onPress?: () => void;
  testID?: string;
}) {
  const Logo = svg.illustration.appLogoDark;
  const scale = size / 72;
  const editable = onPress != null;
  // A disabled Pressable would still swallow the parent card's tap, so read-only is a plain View.
  const Root = editable ? Pressable : View;
  return (
    <Root
      onPress={onPress}
      accessibilityRole={editable ? 'button' : undefined}
      testID={testID}
      style={{ width: size, height: size }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 14.9 * scale,
          overflow: 'hidden',
        }}
      >
        <CachedImage
          uri={uri}
          style={{ width: size, height: size }}
          placeholder={
            editable ? (
              <View style={{ width: size, height: size, backgroundColor: colors.neutral50 }} />
            ) : (
              <DefaultTrip width={size} height={size} preserveAspectRatio="xMidYMid slice" />
            )
          }
        />
        {editable ? (
          <View style={[StyleSheet.absoluteFill, styles.coverOverlay]}>
            <Ionicons name="camera" size={20 * scale} color={colors.white} />
          </View>
        ) : null}
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -1.24 * scale,
          left: -1.24 * scale,
          right: -1.24 * scale,
          bottom: -1.24 * scale,
          borderRadius: 16.14 * scale,
          borderWidth: 2.48 * scale,
          borderColor: colors.black,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: 24.1 * scale,
          height: 24.1 * scale,
          borderRadius: 6.43 * scale,
          borderBottomRightRadius: 14.9 * scale,
          borderWidth: scale,
          borderColor: colors.black,
          overflow: 'hidden',
        }}
      >
        <Logo width={24.1 * scale} height={24.1 * scale} />
      </View>
    </Root>
  );
}
export const tagColors = {
  SOLO: { color: '#0A8194', backgroundColor: '#CEFFFF' },
  FRIENDS: { color: '#335CFF', backgroundColor: 'rgba(71,108,255,0.16)' },
  COUPLES: { color: '#F05252', backgroundColor: '#FCE8E8' },
  FAMILY: { color: '#E3A008', backgroundColor: '#FDF6B2' },
  COMPANY: { color: '#FF5A1F', backgroundColor: '#FEECDC' },
};
export const tagLabels = {
  SOLO: 'Solo',
  FRIENDS: 'Friends',
  COUPLES: 'Couples',
  FAMILY: 'Family',
  COMPANY: 'Company',
} as const;
export function ListingCard({
  item,
  onPress,
  own = false,
  editable = false,
  sparkPrice,
}: {
  /** An `AcquisitionSummary` is Swift's `MarketplaceItem(isAcquired: true)` in `UnlockedMarketPlanView`. */
  item: FeedItem | Listing | AcquisitionSummary;
  /** Omitted → not tappable (an acquisition whose listing is gone). */
  onPress?: () => void;
  own?: boolean;
  editable?: boolean;
  sparkPrice?: number;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const acquisition = 'acquisitionId' in item;
  const acquired = acquisition || ('acquired' in item && item.acquired);
  const count = 'activityCount' in item ? item.activityCount : item.items.length;
  const rating = 'averageRating' in item && item.ratingCount ? item.averageRating : null;
  // A disabled Pressable would still swallow taps, so a non-tappable card is a plain View.
  const Root = onPress ? Pressable : View;
  return (
    <Root
      testID={
        acquisition ? `market-acquisition-${item.acquisitionId}` : `market-listing-${item.id}`
      }
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={styles.card}
    >
      <View style={styles.header}>
        {editable && 'appliedCount' in item ? (
          <View style={[styles.creator, { gap: 8 }]}>
            <Text style={[styles.meta, { color: colors.contentL }]}>{t('Applied')}</Text>
            <NumericText
              value={Math.trunc(item.appliedCount)}
              style={styles.creatorName}
              animated={false}
            />
            {'status' in item ? (
              <Text
                style={[
                  styles.status,
                  {
                    backgroundColor:
                      item.status === 'DRAFT'
                        ? '#878787'
                        : item.status === 'APPROVED'
                          ? '#D9F2D9'
                          : item.status === 'REJECTED'
                            ? '#FFE0E0'
                            : '#FFF0C7',
                    color:
                      item.status === 'DRAFT'
                        ? 'white'
                        : item.status === 'APPROVED'
                          ? '#1A8C33'
                          : item.status === 'REJECTED'
                            ? '#C72626'
                            : '#A67300',
                  },
                ]}
              >
                {t(
                  item.status === 'DRAFT'
                    ? 'Draft'
                    : item.status === 'APPROVED'
                      ? 'Approved'
                      : item.status === 'REJECTED'
                        ? 'Rejected'
                        : 'Pending review',
                )}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.creator}>
            <Avatar uri={item.creatorAvatarUrl} size={24} />
            <Text style={styles.creatorName} numberOfLines={1}>
              {item.creatorName}
            </Text>
          </View>
        )}
        {!own || editable ? (
          <LinearGradient
            colors={
              editable
                ? ['#878787', '#878787']
                : acquired
                  ? ['#E8E8E8', '#E8E8E8']
                  : ['#47BAFF', '#33A3FF']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.pill, !acquired && styles.pillShadow]}
          >
            {!own && !acquired && sparkPrice !== undefined ? (
              <Image
                source={require('@/assets/images/market/rewardBolt.png')}
                style={{ width: 10, height: 13 }}
              />
            ) : null}
            <Text style={[styles.pillText, acquired && { color: colors.contentM }]}>
              {editable
                ? t('Edit')
                : acquired
                  ? t('Unlocked')
                  : (sparkPrice ?? t('Unlock & Apply'))}
            </Text>
          </LinearGradient>
        ) : null}
      </View>
      <View style={styles.body}>
        <MarketThumbnail uri={item.coverImageUrl} />
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1}>
            {item.name}
          </Text>
          <View style={[styles.creator, { gap: 4 }]}>
            <Image
              source={require('@/assets/images/market/marketStar.png')}
              style={{ width: 10, height: 10 }}
            />
            <Text style={[styles.meta, { flexShrink: 1 }]} numberOfLines={1}>
              {rating ? Number(rating).toFixed(1) : t('No ratings yet')} ·{' '}
              {t('%lld activities', { count })} · {t('%lld days', { count: item.durationDays })}
            </Text>
          </View>
          <View style={styles.creator}>
            <Text style={[styles.meta, { flexShrink: 1 }]} numberOfLines={1}>
              {t('From %@%@/person', {
                0: formatWhole(Number(item.price)),
                1: fallbackCurrency(item.currency).symbol,
              })}
            </Text>
            {item.tags[0] ? (
              <Text style={[styles.tag, tagColors[item.tags[0]]]}>
                {t(tagLabels[item.tags[0]])}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </Root>
  );
}
const styles = StyleSheet.create({
  coverOverlay: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    ...beVietnamPro(11),
    lineHeight: 14,
    includeFontPadding: false,
    letterSpacing: -0.5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
  },
  card: { backgroundColor: colors.white, borderRadius: 20, overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral50,
  },
  creator: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  creatorName: {
    ...beVietnamPro(14),
    lineHeight: 17,
    includeFontPadding: false,
    letterSpacing: -0.7,
    color: colors.contentB,
    flexShrink: 1,
  },
  pill: {
    flexDirection: 'row',
    gap: 2,
    alignItems: 'center',
    borderRadius: 99,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  pillText: {
    ...beVietnamPro(14),
    lineHeight: 17,
    includeFontPadding: false,
    letterSpacing: -0.7,
    color: colors.white,
  },
  body: { flexDirection: 'row', gap: 10, padding: 16, alignItems: 'center' },
  copy: { flex: 1, gap: 4 },
  title: {
    ...beVietnamPro(17),
    lineHeight: 21,
    includeFontPadding: false,
    letterSpacing: -0.85,
    color: colors.contentB,
  },
  meta: {
    ...beVietnamPro(14),
    lineHeight: 17,
    includeFontPadding: false,
    letterSpacing: -0.6,
    color: colors.contentM,
  },
  tag: {
    ...beVietnamPro(14),
    lineHeight: 17,
    includeFontPadding: false,
    color: colors.blueBase,
    backgroundColor: colors.blueAlpha16,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
});
