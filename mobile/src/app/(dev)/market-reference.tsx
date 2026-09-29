import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ListingCard } from '@/features/market/components/ListingCard';
import type { FeedItem, Listing } from '@/features/market/api/queries';
const fixture: FeedItem = {
  id: 1,
  createdById: 2,
  name: 'Da Lat Trip for Friends',
  creatorName: 'Vivian solo',
  creatorAvatarUrl: null,
  price: '2500000',
  currency: 'VND',
  tags: ['FRIENDS'],
  durationDays: 3,
  activityCount: 21,
  appliedCount: 1253,
  averageRating: null,
  ratingCount: 0,
  acquired: false,
  createdAt: '2026-01-01T00:00:00Z',
};
const draft: Listing = {
  ...fixture,
  status: 'DRAFT',
  publicId: 'fixture',
  sourceLocale: 'en',
  availableLocales: ['en'],
  updatedAt: fixture.createdAt,
  items: [],
};
export default function MarketReference() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <ListingCard item={fixture} sparkPrice={30} onPress={() => {}} />
        <ListingCard item={{ ...fixture, acquired: true }} onPress={() => {}} />
        <ListingCard item={draft} own editable onPress={() => {}} />
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F7F7' },
  content: { paddingHorizontal: 16, paddingTop: 20, gap: 16 },
});
