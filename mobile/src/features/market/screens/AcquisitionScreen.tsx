import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { mutationErrorMessage } from '@/api/mutationError';
import { useAppLanguage } from '@/i18n';
import { requireOnline } from '@/offline/guardOnline';
import { Button, CachedImage, GlassIconButton } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import { useApplyPlan } from '../api/mutations';
import { useAcquisition } from '../api/queries';
import { MarketThumbnail } from '../components/ListingCard';
import { MarketState } from '../components/MarketState';
export default function AcquisitionScreen({ success = false }: { success?: boolean }) {
  useAppLanguage();
  const { t } = useTranslation();
  const router = useRouter();
  const { acquisitionId, tripId } = useLocalSearchParams<{
    acquisitionId: string;
    tripId?: string;
  }>();
  const query = useAcquisition(Number(acquisitionId));
  const apply = useApplyPlan();
  const busy = useRef(false);
  const insets = useSafeAreaInsets();
  const item = query.data;
  async function proceed() {
    if (!item || busy.current || !requireOnline(t)) return;
    busy.current = true;
    try {
      const id = await apply.mutateAsync({
        acquisitionId: item.acquisitionId,
        listingId: item.listingId,
        tripId: tripId ? Number(tripId) : undefined,
      });
      // Applied to the source trip → back on "Your plan", like iOS `.marketplacePlanApplied`
      // → `selectedTab = .yourPlan`.
      router.dismissTo({
        pathname: '/trip/[tripId]',
        params: tripId ? { tripId: id, tab: 'plan' } : { tripId: id },
      });
    } catch (error) {
      Alert.alert(t('Error'), mutationErrorMessage(error, t('Failed to apply plan to trip')));
    } finally {
      busy.current = false;
    }
  }
  if (success && item)
    return (
      // Inside the market full-screen modal `SafeAreaView` measures a 0 top inset — pad the
      // toolbar with the window insets instead.
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.screen}>
        {/* `PurchasedTripSuccessView`: top-trailing `ToolbarIconButton(systemName: "xmark")`. */}
        <View style={[styles.close, { marginTop: insets.top }]}>
          <GlassIconButton
            label={t('Close')}
            icon="close"
            testID="market-success-close"
            onPress={() => router.back()}
          />
        </View>
        <View style={styles.successContent}>
          <View style={styles.successCopy}>
            <Text style={styles.successTitle}>{t('Your plan is ready')}</Text>
            <Text style={styles.successSubtitle}>
              {t('Select a trip and start date to apply this plan.')}
            </Text>
          </View>
          <View style={styles.successPlan}>
            <View style={styles.rotatedThumbnail}>
              <MarketThumbnail uri={item.coverImageUrl} size={160} />
            </View>
            <View style={styles.successNameGroup}>
              <Text style={styles.successName} numberOfLines={1}>
                {item.name}
              </Text>
              <View style={styles.metadata}>
                <Text style={styles.successMeta}>
                  {t('%lld activities', { count: item.activityCount })}
                </Text>
                <View style={styles.dot} />
                <Text style={styles.successMeta}>
                  {t('%lld days', { count: item.durationDays })}
                </Text>
              </View>
            </View>
          </View>
        </View>
        {tripId || item.listingStillAvailable ? (
          <Button
            style={styles.successAction}
            title={
              tripId
                ? t(apply.isPending ? 'Applying...' : 'Apply to current trip')
                : t(apply.isPending ? 'Creating...' : 'Create new trip')
            }
            disabled={apply.isPending}
            onPress={() => {
              void proceed();
            }}
          />
        ) : null}
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Button variant="secondary" title={t('Close')} onPress={() => router.back()} />
        {!item ? (
          <MarketState
            loading={query.isPending}
            error={query.isError}
            retry={() => {
              void query.refetch();
            }}
          />
        ) : (
          <>
            <MarketThumbnail uri={item.coverImageUrl} />
            <Text style={styles.title}>{success ? t('Unlocked') : item.name}</Text>
            <Text style={styles.title}>{success ? item.name : item.description}</Text>
            <Text style={styles.body}>
              {t('%lld days', { count: item.durationDays })} ·{' '}
              {t('%lld activities', { count: item.activityCount })}
            </Text>
            {tripId || item.listingStillAvailable ? (
              <Button
                title={t(tripId ? 'Apply plan to your trip' : 'Create new trip')}
                loading={apply.isPending}
                onPress={() => {
                  void proceed();
                }}
              />
            ) : null}
            {!success
              ? item.items
                  .slice()
                  .sort((a, b) => a.dayNumber - b.dayNumber || a.sortOrder - b.sortOrder)
                  .map((activity) => (
                    <ScrollView key={activity.id} style={styles.card}>
                      <Text style={styles.body}>
                        {t('Day %lld', { 0: activity.dayNumber })} · {activity.startTime}
                      </Text>
                      <Text style={styles.title}>{activity.title}</Text>
                      <Text style={styles.body}>{activity.description}</Text>
                      {activity.imageUrls.map((uri) => (
                        <CachedImage key={uri} uri={uri} style={styles.image} />
                      ))}
                    </ScrollView>
                  ))
              : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  close: { height: 44, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 16 },
  successContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 24,
    paddingBottom: 72,
  },
  successCopy: { gap: 12, alignItems: 'center' },
  successTitle: {
    ...beVietnamPro(32),
    letterSpacing: -1.28,
    textAlign: 'center',
    color: colors.contentB,
  },
  successSubtitle: {
    ...beVietnamPro(14),
    letterSpacing: -0.28,
    textAlign: 'center',
    color: colors.contentB,
  },
  successPlan: { alignItems: 'center', gap: 19, width: '100%' },
  rotatedThumbnail: {
    width: 185.35,
    height: 185.35,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-10deg' }],
  },
  successNameGroup: { alignItems: 'center', gap: 8, width: '100%' },
  successName: {
    ...beVietnamPro(24, 'medium'),
    letterSpacing: -0.48,
    textAlign: 'center',
    color: colors.contentB,
  },
  metadata: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  successMeta: { ...beVietnamPro(15), letterSpacing: -0.3, color: colors.neutral600 },
  dot: { width: 3.8, height: 3.8, borderRadius: 2, backgroundColor: colors.neutral600 },
  successAction: { margin: 16 },
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, gap: 20, alignItems: 'center' },
  title: { ...beVietnamPro(20), textAlign: 'center', color: colors.contentB },
  body: { ...beVietnamPro(14), color: colors.contentM },
  card: { padding: 16, backgroundColor: colors.white, borderRadius: 20, width: '100%' },
  image: { width: '100%', height: 180, borderRadius: 16 },
});
