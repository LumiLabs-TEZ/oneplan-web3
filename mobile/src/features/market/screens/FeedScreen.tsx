import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import FireIcon from '@/assets/images/market/fireTrendingIcon.svg';
import StarIcon from '@/assets/images/market/goldenStarIcon.svg';
import { Keyboard, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { track } from '@/analytics/track';
import { useMe } from '@/features/me/useMe';
import { useTabContentInsets } from '@/features/shell/useTabContentInsets';
import type { LocationSearchResultDto } from '@/features/location/api/queries';
import { LocationPickerScreen } from '@/features/location/components/LocationPickerScreen';
import { useTrip } from '@/features/trip/api/queries';
import { useIsPro, useSubscriptionStatus } from '@/features/subscription/api/queries';
import { useAppLanguage } from '@/i18n';
import { maybeShowMarketInterstitial } from '@/native/ads/ads';
import { GlassIconButton } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import { type FeedFilters, useMarketFeed } from '../api/queries';
import { ListingCard } from '../components/ListingCard';
import { MarketplaceFilterStrip } from '../components/MarketplaceFilterStrip';
import { MarketplaceSearchbar } from '../components/MarketplaceSearchbar';
import { useMarketSparkPrice } from '../helpers/useMarketSparkPrice';
import { MarketState } from '../components/MarketState';
import { MarketTopGlow } from '../components/MarketTopGlow';

export default function FeedScreen({ tab = false }: { tab?: boolean }) {
  useAppLanguage();
  const { t } = useTranslation();
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  const sourceTrip = useTrip(tripId ? Number(tripId) : undefined);
  const initialDestination = useRef(false);
  const subscription = useSubscriptionStatus();
  const [filters, setFilters] = useState<FeedFilters>({ tab: 'TRENDING' });
  const [destination, setDestination] = useState<LocationSearchResultDto>();
  const [isPickerOpen, setPickerOpen] = useState(false);
  const insets = useTabContentInsets();
  const safeInsets = useSafeAreaInsets();
  const feed = useMarketFeed(filters);
  const me = useMe();
  const isPro = useIsPro();
  const sparkPrice = useMarketSparkPrice();
  useEffect(() => {
    track('MARKET_OPENED');
  }, []);
  useFocusEffect(
    useCallback(() => {
      // The trip-plan cover opts out of the interstitial (iOS `showsInterstitialAd: false`).
      if (subscription.isSuccess && !tripId) void maybeShowMarketInterstitial(isPro);
    }, [isPro, subscription.isSuccess, tripId]),
  );
  useEffect(() => {
    const location = sourceTrip.data?.location;
    if (!location || initialDestination.current) return;
    initialDestination.current = true;
    setFilters((f) => ({
      ...f,
      cityId: location.cityId ?? undefined,
      stateId: location.stateId ?? undefined,
      countryId: location.countryId ?? undefined,
    }));
  }, [sourceTrip.data]);
  const chooseDestination = (value: LocationSearchResultDto) => {
    setDestination(value);
    setFilters((f) => ({
      ...f,
      cityId: value.city?.id,
      stateId: value.state?.id,
      countryId: value.country.id,
    }));
  };
  const clearDestination = () => {
    setDestination(undefined);
    setFilters((f) => ({ ...f, cityId: undefined, stateId: undefined, countryId: undefined }));
  };
  return (
    // `SafeAreaView` measures a 0 top inset inside the full-screen modal, so the cover toolbar
    // pads with the provider's window insets instead.
    <SafeAreaView edges={tab ? [] : ['bottom']} style={styles.screen}>
      <MarketTopGlow />
      {!tab ? (
        /* iOS cover toolbar: a single trailing xmark (`TripPlanSection.swift:527`). */
        <View style={[styles.toolbar, { marginTop: safeInsets.top }]}>
          <GlassIconButton
            label={t('Close')}
            icon="close"
            testID="market-explore-close"
            onPress={() => router.back()}
          />
        </View>
      ) : null}
      <FlashList
        data={feed.data?.items ?? []}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={tab ? [styles.content, insets.contentStyle] : styles.content}
        showsVerticalScrollIndicator={!tab}
        refreshing={feed.isRefetching}
        onRefresh={() => {
          void feed.refetch();
        }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.searchCard}>
              <MarketplaceSearchbar
                destination={
                  destination
                    ? (destination.city?.name ??
                      destination.state?.name ??
                      destination.country.name)
                    : undefined
                }
                placeholder={sourceTrip.data?.location?.cityName ?? undefined}
                onPress={() => {
                  Keyboard.dismiss();
                  setPickerOpen(true);
                }}
                onClear={clearDestination}
              />
              <View style={styles.tabs}>
                {(['TRENDING', 'TOP_RATED'] as const).map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: filters.tab === value }}
                    style={styles.tab}
                    onPress={() => setFilters((f) => ({ ...f, tab: value }))}
                  >
                    <View style={styles.tabLabel}>
                      {value === 'TRENDING' ? (
                        <FireIcon width={18} height={18} />
                      ) : (
                        <StarIcon width={18} height={18} />
                      )}
                      <Text style={styles.tabText}>
                        {t(value === 'TRENDING' ? 'Trending' : 'Top Rated')}
                      </Text>
                    </View>
                    <View
                      style={{
                        width: 32,
                        height: 2,
                        backgroundColor: filters.tab === value ? colors.blueBase : 'transparent',
                      }}
                    />
                  </Pressable>
                ))}
              </View>
            </View>
            <MarketplaceFilterStrip filters={filters} onChange={setFilters} />
            {destination &&
            feed.data?.matchedDestinationScope &&
            feed.data.matchedDestinationScope !== 'CITY' ? (
              <Text style={styles.body}>
                {t('No plans for this destination yet. Explore nearby destinations.')}
              </Text>
            ) : null}
            <Text style={styles.sectionTitle}>{t('Recommended for you')}</Text>
          </View>
        }
        ListEmptyComponent={
          <MarketState
            loading={feed.isPending}
            error={feed.isError}
            retry={() => {
              void feed.refetch();
            }}
          />
        }
        renderItem={({ item }) => (
          <ListingCard
            item={item}
            own={item.createdById === me.data?.id}
            sparkPrice={sparkPrice}
            onPress={() =>
              router.push({ pathname: '/market/listing/[id]', params: { id: item.id, tripId } })
            }
          />
        )}
      />
      {/* iOS `.fullScreenCover` → `TripLocationPickerSheet` (`MarketView.swift:150`), the same picker
          as Create Trip. A native full-screen `Modal` slides up like the cover and also stacks
          over the `market/index` fullScreenModal entry. */}
      <Modal
        visible={isPickerOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setPickerOpen(false)}
      >
        <LocationPickerScreen
          onClose={() => setPickerOpen(false)}
          onSelect={(result) => {
            chooseDestination(result);
            setPickerOpen(false);
          }}
        />
      </Modal>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  searchCard: { backgroundColor: colors.white, borderRadius: 20, overflow: 'hidden', gap: 10 },
  tabs: { flexDirection: 'row', gap: 27, paddingHorizontal: 16 },
  tab: { flex: 1, alignItems: 'center', gap: 11 },
  tabLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabText: { ...beVietnamPro(15, 'medium'), letterSpacing: -0.15, color: colors.contentB },
  sectionTitle: { ...beVietnamPro(14), color: colors.contentM, letterSpacing: -0.7, marginTop: 12 },
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 110 },
  header: { gap: 8, marginBottom: 16 },
  /** iOS navigation bar row (44pt) holding the trailing xmark. */
  toolbar: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
  },
  heading: { ...beVietnamPro(22), flex: 1, color: colors.contentB },
  hero: { ...beVietnamPro(14), color: colors.contentB },
  body: { ...beVietnamPro(14), color: colors.contentB },
});
