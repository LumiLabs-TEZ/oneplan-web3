import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppLanguage } from '@/i18n';
import { BackButton } from '@/ui/components/BackButton';
import { useMe } from '@/features/me/useMe';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import { useAcquisitions, useCreator, useMyListings } from '../api/queries';
import { ListingCard } from '../components/ListingCard';
import { MarketState } from '../components/MarketState';
import { MarketTopGlow } from '../components/MarketTopGlow';
import { ProfileHeader } from '../components/ProfileHeader';
export default function LibraryScreen({ mode }: { mode: 'owner' | 'creator' | 'unlocked' }) {
  const { userId, tripId } = useLocalSearchParams<{ userId?: string; tripId?: string }>();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      {/* `MarketProfileOwnerView` / `MarketProfileGuestView` / `UnlockedMarketPlanView`
          `topBlurBackground`. */}
      <MarketTopGlow />
      <View style={[styles.row, { paddingTop: insets.top + 6 }]}>
        <BackButton testID="market-library-back" />
      </View>
      {mode === 'owner' ? (
        <Owner />
      ) : mode === 'creator' ? (
        <Creator id={Number(userId)} />
      ) : (
        <Unlocked tripId={tripId} />
      )}
    </View>
  );
}
/**
 * The scrolling body shared by the three modes: one recycling list of `ListingCard`s. Each mode
 * shows at most one section label, always above the first card, so it rides in the list header
 * rather than as a row. Spacing is margins, not `gap` — FlashList's content container also holds
 * its own zero-size helper views, which a gap would space out.
 */
function LibraryList<T>({
  data,
  keyExtractor,
  renderItem,
  header,
  empty,
  unlocked = false,
}: {
  data: readonly T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => ReactElement;
  header?: ReactElement | null;
  empty: ReactElement;
  unlocked?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <FlashList
      data={data}
      keyExtractor={keyExtractor}
      renderItem={({ item }) => renderItem(item)}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.content,
        unlocked ? styles.contentUnlocked : null,
        { paddingBottom: insets.bottom + 40 },
      ]}
      ItemSeparatorComponent={CardSeparator}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
    />
  );
}
function CardSeparator() {
  return <View style={styles.separator} />;
}
function Owner() {
  useAppLanguage();
  const { t } = useTranslation();
  const router = useRouter();
  const query = useMyListings();
  const me = useMe();
  const listings = query.data ?? [];
  return (
    <LibraryList
      data={listings}
      keyExtractor={(item) => String(item.id)}
      header={
        <View style={listings.length ? styles.headerBeforeLabel : styles.headerBeforeBody}>
          <ProfileHeader
            name={me.data?.displayName}
            avatarUrl={me.data?.avatarUrl}
            createdAt={me.data?.createdAt}
            appliedCount={
              listings.length
                ? listings.reduce((sum, item) => sum + item.appliedCount, 0)
                : undefined
            }
          />
          {listings.length ? (
            <Text style={[styles.sectionLabel, styles.ownerLabel]}>{t('Uploaded plans')}</Text>
          ) : null}
        </View>
      }
      renderItem={(item) => (
        <ListingCard
          item={item}
          own
          editable
          onPress={() => router.push({ pathname: '/market/editor', params: { id: item.id } })}
        />
      )}
      empty={
        <MarketState
          loading={query.isPending}
          error={query.isError}
          retry={() => {
            void query.refetch();
          }}
        />
      }
    />
  );
}
function Creator({ id }: { id: number }) {
  const router = useRouter();
  const query = useCreator(id);
  const listings = query.data?.listings ?? [];
  return (
    <LibraryList
      data={listings}
      keyExtractor={(item) => String(item.id)}
      header={
        <View style={styles.headerBeforeBody}>
          <ProfileHeader
            name={query.data?.displayName}
            avatarUrl={query.data?.avatarUrl}
            createdAt={query.data?.createdAt}
            appliedCount={
              listings.length
                ? listings.reduce((sum, item) => sum + item.appliedCount, 0)
                : undefined
            }
          />
        </View>
      }
      renderItem={(item) => (
        <ListingCard
          item={item}
          onPress={() => router.push({ pathname: '/market/listing/[id]', params: { id: item.id } })}
        />
      )}
      empty={
        <MarketState
          loading={query.isPending}
          error={query.isError}
          retry={() => {
            void query.refetch();
          }}
        />
      }
    />
  );
}
/** `UnlockedMarketPlanView.swift`. */
function Unlocked({ tripId }: { tripId?: string }) {
  useAppLanguage();
  const { t } = useTranslation();
  const query = useAcquisitions();
  const router = useRouter();
  const settled = !query.isPending && !query.isError;
  return (
    <LibraryList
      unlocked
      data={settled ? query.data : []}
      keyExtractor={(item) => String(item.acquisitionId)}
      header={
        settled ? (
          <Text style={[styles.sectionLabel, styles.unlockedLabel]}>{t('Your Plan')}</Text>
        ) : null
      }
      renderItem={(item) => {
        const listingId = item.listingStillAvailable ? item.listingId : null;
        return (
          <ListingCard
            item={item}
            onPress={
              listingId != null
                ? () =>
                    router.push({
                      pathname: '/market/listing/[id]',
                      params: { id: listingId, tripId },
                    })
                : undefined
            }
          />
        );
      }}
      empty={
        settled ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('No unlocked plans yet')}</Text>
          </View>
        ) : (
          <MarketState
            loading={query.isPending}
            error={query.isError}
            retry={() => {
              void query.refetch();
            }}
          />
        )
      }
    />
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, overflow: 'hidden' },
  // `MarketProfileOwnerView`: VStack(spacing: 24), `.safeAreaPadding(.horizontal, 16)`.
  content: { paddingHorizontal: 16, paddingTop: 8 },
  // `UnlockedMarketPlanView`: VStack(spacing: 16); the empty state centers in the remaining height.
  contentUnlocked: { flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 16,
  },
  // Header → body is the VStack's 24; header → its label → first card keeps the section's 16.
  headerBeforeBody: { marginBottom: 24 },
  headerBeforeLabel: { marginBottom: 16 },
  separator: { height: 8 },
  sectionLabel: { ...beVietnamPro(14), color: colors.contentM, letterSpacing: -0.7 },
  ownerLabel: { marginTop: 24 },
  unlockedLabel: { paddingTop: 14, marginBottom: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { ...beVietnamPro(16), color: colors.contentM, letterSpacing: -0.8 },
});
