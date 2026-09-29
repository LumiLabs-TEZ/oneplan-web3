/**
 * Market plan-item detail — Time / Location / Message card + photo strip under a blue top glow.
 * Port of `MarketPlanDetailView.swift`, pushed from the listing screen's plan section
 * (`MarketItemDetailView.swift:240-252`). The item comes from the cached `useListing` query.
 */
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GestureTrigger } from 'react-native-gesture-image-viewer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppLanguage } from '@/i18n';
import { recordMarketPlanDetailDismissed } from '@/native/ads/ads';
import { BackButton } from '@/ui/components/BackButton';
import { CachedImage, SFSymbol } from '@/ui/components';
import { ImageViewerModal } from '@/ui/components/ImageViewerModal';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import { useListing } from '../api/queries';
import { MarketState } from '../components/MarketState';
import { MarketTopGlow } from '../components/MarketTopGlow';

/** `topBlurBackground`: 385×385 circle, offset −280 → center at y −87.5. */
const GLOW_RADIUS = 192.5;
const GLOW_CENTER_Y = -87.5;
const PHOTO = 112;

function textOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function PlanItemDetailScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { listingId = '', itemId } = useLocalSearchParams<{ listingId: string; itemId: string }>();
  const listing = useListing(listingId);
  const item = listing.data?.items.find((entry) => String(entry.id) === itemId);
  const [images, setImages] = useState<string[]>([]);
  const [imageIndex, setImageIndex] = useState(0);
  const photoViewerId = useId();
  useEffect(() => () => recordMarketPlanDetailDismissed(), []);

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
      <BackButton testID="market-plan-detail-back" />
    </View>
  );

  if (!item) {
    return (
      <View style={styles.root}>
        <View style={{ paddingTop: insets.top + 52 }}>
          <MarketState
            loading={listing.isPending}
            error={listing.isError}
            retry={() => void listing.refetch()}
          />
        </View>
        {header}
      </View>
    );
  }

  const time = textOrNull(item.startTime);
  const day = t('Day %lld', { 0: item.dayNumber });
  const timeAndDay = time ? t('%@ - %@', { 0: time, 1: day }) : day;
  const location = textOrNull(item.location) ?? t('Not set');
  const hasCoordinate = item.latitude != null && item.longitude != null;
  const openLocation = () => {
    if (item.latitude == null || item.longitude == null) return;
    router.push({
      pathname: '/market/location',
      params: {
        mode: 'view',
        name: location,
        lat: String(item.latitude),
        lng: String(item.longitude),
        address: item.address ?? '',
        category: item.category ?? '',
      },
    } as unknown as Href);
  };

  return (
    <View style={styles.root}>
      <MarketTopGlow radius={GLOW_RADIUS} centerY={GLOW_CENTER_Y} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: insets.top + 52, paddingBottom: insets.bottom + 16 }}
      >
        <Text
          style={styles.title}
          numberOfLines={3}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          testID="market-plan-detail-title"
        >
          {textOrNull(item.title) ?? t('Untitled Plan')}
        </Text>
        <View style={styles.content}>
          <View style={styles.card}>
            <Row title={t('Time')}>
              <Text style={styles.value} numberOfLines={1}>
                {timeAndDay}
              </Text>
            </Row>
            <Divider />
            <Pressable
              accessibilityRole="button"
              disabled={!hasCoordinate}
              onPress={openLocation}
              testID="market-plan-detail-location"
            >
              <Row title={t('Location')}>
                <Text style={[styles.value, styles.shrink]} numberOfLines={1}>
                  {location}
                </Text>
                {hasCoordinate ? (
                  <SFSymbol
                    name="chevron.right"
                    fallback="chevron-forward"
                    size={12}
                    weight="600"
                    color={colors.contentM}
                  />
                ) : null}
              </Row>
            </Pressable>
            <Divider />
            <View style={styles.message}>
              <Text style={styles.label}>{t('Message')}</Text>
              <Text style={styles.value}>{textOrNull(item.description) ?? t('No message')}</Text>
            </View>
          </View>
          {item.imageUrls.length > 0 ? (
            <View style={styles.photos}>
              <Text style={styles.label}>{t('Photos (%lld/5)', { 0: item.imageUrls.length })}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.photoRow}
              >
                {item.imageUrls.map((uri, index) => (
                  <GestureTrigger
                    key={`${uri}-${index}`}
                    id={photoViewerId}
                    index={index}
                    onPress={() => {
                      setImageIndex(index);
                      setImages(item.imageUrls);
                    }}
                  >
                    <Pressable accessibilityRole="button">
                      <CachedImage uri={uri} style={styles.photo} />
                    </Pressable>
                  </GestureTrigger>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </ScrollView>
      {header}
      <ImageViewerModal
        images={images}
        triggerId={photoViewerId}
        initialIndex={imageIndex}
        visible={images.length > 0}
        onClose={() => setImages([])}
      />
    </View>
  );
}

/** `MarketPlanDetailRow`: label, spacer, single-line trailing content. */
function Row({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.trailing}>{children}</View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, overflow: 'hidden' },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  title: {
    ...beVietnamPro(36),
    color: colors.contentB,
    textAlign: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  content: { paddingHorizontal: 12, gap: 4 },
  card: { backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  trailing: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  shrink: { flexShrink: 1 },
  label: { ...beVietnamPro(14), color: colors.contentM },
  value: { ...beVietnamPro(16), color: colors.contentB },
  divider: { height: 1, backgroundColor: colors.dividerStroke },
  message: { paddingHorizontal: 12, paddingVertical: 14, gap: 8 },
  photos: { padding: 8, gap: 8, backgroundColor: colors.surface, borderRadius: 16 },
  photoRow: { gap: 4 },
  photo: { width: PHOTO, height: PHOTO, borderRadius: 12, backgroundColor: colors.neutral100 },
});
