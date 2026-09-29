/**
 * Friend profile "Public plans" tab — port of `FriendProfileView.publicPlansSection`
 * (`FriendProfileView.swift:150-196`): centred spinner / grey "No plans yet" 40pt down, otherwise
 * the creator's listings as marketplace feed cards, 8pt apart.
 */
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { useMe } from '@/features/me/useMe';
import { useAppLanguage } from '@/i18n';
import { Spinner } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { useCreator } from '../api/queries';
import { useMarketSparkPrice } from '../helpers/useMarketSparkPrice';
import { ListingCard } from './ListingCard';
import { MarketState } from './MarketState';

export function PublicPlans({ userId }: { userId: number }) {
  useAppLanguage();
  const { t } = useTranslation();
  const query = useCreator(userId);
  const me = useMe();
  const sparkPrice = useMarketSparkPrice();
  const router = useRouter();
  const listings = query.data?.listings ?? [];

  if (query.isPending) {
    return (
      <View style={styles.state}>
        <Spinner />
      </View>
    );
  }
  if (query.isError && listings.length === 0) {
    return (
      <View style={styles.root}>
        <MarketState
          error
          retry={() => {
            void query.refetch();
          }}
        />
      </View>
    );
  }
  if (listings.length === 0) {
    return (
      <View style={styles.state}>
        <Text style={styles.empty}>{t('No plans yet')}</Text>
      </View>
    );
  }
  return (
    <View style={styles.root}>
      {listings.map((item) => (
        <ListingCard
          key={item.id}
          item={item}
          own={item.createdById === me.data?.id}
          sparkPrice={sparkPrice}
          onPress={() => router.push({ pathname: '/market/listing/[id]', params: { id: item.id } })}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: 8 },
  state: { width: '100%', alignItems: 'center', paddingTop: 40 },
  empty: { ...beVietnamPro(16), color: colors.contentM, letterSpacing: -0.8 },
});
