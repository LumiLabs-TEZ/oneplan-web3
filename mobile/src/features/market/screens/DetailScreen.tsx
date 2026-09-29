import { Ionicons } from '@expo/vector-icons';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useId, useRef, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { track } from '@/analytics/track';
import { reportMissionEvent, useMissions } from '@/features/missions/api/queries';
import { keys } from '@/api/keys';
import { mutationErrorMessage } from '@/api/mutationError';
import { useMe } from '@/features/me/useMe';
import { useIsPro } from '@/features/subscription/api/queries';
import { formatWhole, fallbackCurrency } from '@/lib/currency';
import { useAppLanguage } from '@/i18n';
import { listingUrl } from '@/links/deepLinkBuilder';
import { shareLink } from '@/native/share/shareLink';
import { requireOnline } from '@/offline/guardOnline';
import { AppSheet, type AppSheetRef } from '@/ui/components/AppSheet';
import { Avatar, Button, GlassSurface } from '@/ui/components';
import { ImageViewerModal } from '@/ui/components/ImageViewerModal';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import { useAcquireListing } from '../api/mutations';
import { useApplied, useListing } from '../api/queries';
import { MarketThumbnail } from '../components/ListingCard';
import { MarketPlanSection } from '../components/MarketPlanSection';
import { MarketState } from '../components/MarketState';
import { MarketTopGlow } from '../components/MarketTopGlow';
import { acquisitionAction, canAffordUnlock } from '../helpers/acquisition';
import { ratingLabel, showUpdatedCaption } from '../helpers/marketTimeline';

export default function DetailScreen() {
  const language = useAppLanguage();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id = '', tripId } = useLocalSearchParams<{ id: string; tripId?: string }>();
  const listing = useListing(id);
  const value = listing.data;
  const me = useMe();
  const isPro = useIsPro();
  const rewards = useMissions();
  const applied = useApplied(value?.id);
  const acquire = useAcquireListing(value?.id ?? 0);
  const unlock = useRef<AppSheetRef>(null);
  const [images, setImages] = useState<string[]>([]);
  const photoViewerId = useId();
  const [imageIndex, setImageIndex] = useState(0);
  // Ref, not state: the sheet's close animation captures `onDismiss` before React re-renders, so
  // a state value set right before `dismiss()` reads back as undefined (Redeem silently no-op'd).
  const pending = useRef<'spark' | 'pro'>(undefined);
  const busy = useRef(false);
  const shop = rewards.data?.shopItems.find((item) => item.itemId === 'market_unlock');
  useEffect(() => {
    if (value?.id) track('PLAN_VIEWED', { listingId: value.id });
  }, [value?.id]);
  const action = acquisitionAction({
    owner: value?.createdById === me.data?.id,
    acquired: applied.data?.applied === true,
    isPro,
    approved: value?.status === 'APPROVED',
    shop,
  });
  const success = (acquisitionId: number) =>
    router.push({ pathname: '/market/success', params: { acquisitionId, tripId } });
  async function acquireNow(method: 'spark' | 'pro') {
    if (!requireOnline(t) || busy.current || !value) return;
    if (method === 'spark' && !canAffordUnlock(rewards.data?.balance ?? 0, shop)) {
      Alert.alert(t('Error'), t('Not enough Sparks'));
      return;
    }
    busy.current = true;
    try {
      success(await acquire.mutateAsync(method));
    } catch (error) {
      Alert.alert(t('Error'), mutationErrorMessage(error, t('Failed to acquire this plan')));
    } finally {
      busy.current = false;
    }
  }
  function apply() {
    if (action === 'apply' && applied.data?.acquisitionId) success(applied.data.acquisitionId);
    else if (action === 'acquire') void acquireNow('pro');
    else if (action === 'choose') unlock.current?.present();
    else if (action === 'pro') router.push('/paywall');
  }
  async function share() {
    if (!value) return;
    try {
      if (!(await shareLink(listingUrl(value.publicId)))) return;
      track('MARKET_SHARED', { listingId: value.id });
      if (requireOnline(t)) {
        await reportMissionEvent({ event: 'market_shared', listingId: value.id });
        await queryClient.invalidateQueries({ queryKey: keys.missions });
      }
    } catch (error) {
      Alert.alert(t('Error'), mutationErrorMessage(error, t('Something went wrong')));
    }
  }
  const updatedCaption =
    value && showUpdatedCaption(value.createdAt, value.updatedAt, value.ratingCount)
      ? t('Updated %@ · some ratings may predate this', {
          0: new Intl.DateTimeFormat(language, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }).format(new Date(value.updatedAt)),
        })
      : null;
  const headerHeight = insets.top + HEADER_BUTTON + 8;
  return (
    <View style={styles.screen}>
      <MarketTopGlow />
      {!value ? (
        <View style={[styles.state, { paddingTop: headerHeight }]}>
          <MarketState
            loading={listing.isPending}
            error={listing.isError}
            retry={() => {
              void listing.refetch();
            }}
          />
        </View>
      ) : (
        <>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.content,
              { paddingTop: headerHeight + 8, paddingBottom: insets.bottom + 104 },
            ]}
          >
            <View style={styles.hero}>
              <Pressable
                onPress={() => {
                  setImageIndex(0);
                  if (value.coverImageUrl) setImages([value.coverImageUrl]);
                }}
              >
                <MarketThumbnail uri={value.coverImageUrl} />
              </Pressable>
              <View style={styles.titleBlock}>
                <Text style={styles.title} numberOfLines={2}>
                  {value.name}
                </Text>
                <View style={styles.metaRow}>
                  <View style={styles.rating}>
                    <Ionicons name="star" size={9} color={STAR} />
                    <Text style={styles.meta}>
                      {ratingLabel(value.averageRating, value.ratingCount, t)}
                    </Text>
                  </View>
                  <View style={styles.dot} />
                  <Text style={styles.meta}>
                    {t('%lld activities', { count: value.items.length })}
                  </Text>
                  <View style={styles.dot} />
                  <Text style={styles.meta}>{t('%lld days', { count: value.durationDays })}</Text>
                </View>
                {updatedCaption ? <Text style={styles.caption}>{updatedCaption}</Text> : null}
                <Pressable
                  style={styles.creator}
                  onPress={() =>
                    router.push({
                      pathname: '/market/creator/[userId]',
                      params: { userId: value.createdById },
                    })
                  }
                >
                  <Avatar uri={value.creatorAvatarUrl} size={24} />
                  <Text style={styles.creatorName} numberOfLines={1}>
                    {value.creatorName}
                  </Text>
                </Pressable>
              </View>
            </View>
            {value.description ? (
              <Text style={[styles.description, styles.listingDescription]}>
                {value.description}
              </Text>
            ) : null}
            <View style={styles.plan}>
              <MarketPlanSection
                items={value.items}
                durationDays={value.durationDays}
                onItemPress={(item) =>
                  router.push({
                    pathname: '/market/plan-item',
                    params: { listingId: id, itemId: String(item.id) },
                  })
                }
              />
            </View>
          </ScrollView>
          <View style={[styles.applyBar, { bottom: insets.bottom + 12 }]}>
            <MarketThumbnail uri={value.coverImageUrl} size={42} />
            <View style={styles.applyCopy}>
              <Text style={styles.applyTitle} numberOfLines={1}>
                {value.name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {t('Budget: ~%@', {
                  0: `${formatWhole(Number(value.price))} ${fallbackCurrency(value.currency).symbol}`,
                })}
              </Text>
            </View>
            {action !== 'none' ? (
              <ApplyButton
                title={acquire.isPending ? t('Applying...') : t('Apply')}
                disabled={
                  acquire.isPending ||
                  !applied.isSuccess ||
                  !me.isSuccess ||
                  (!isPro && !applied.data?.applied && rewards.isPending)
                }
                onPress={apply}
              />
            ) : null}
          </View>
        </>
      )}
      <View style={[styles.header, { paddingTop: insets.top }]} pointerEvents="box-none">
        <HeaderButton
          label={t('Back')}
          icon="chevron-back"
          testID="market-detail-back"
          onPress={() => router.back()}
        />
        {value?.status === 'APPROVED' ? (
          <HeaderButton
            label={t('Share')}
            icon="share-outline"
            testID="market-detail-share"
            onPress={() => {
              void share();
            }}
          />
        ) : null}
      </View>
      <AppSheet
        ref={unlock}
        snapPoints={[340]}
        onDismiss={() => {
          const next = pending.current;
          pending.current = undefined;
          // gorhom fires onDismiss while its portal is still unmounting; pushing the fullScreenModal
          // synchronously here mounts it without safe-area insets and with dead touches.
          requestAnimationFrame(() => {
            if (next === 'pro') router.push('/paywall');
            else if (next === 'spark') void acquireNow('spark');
          });
        }}
      >
        <BottomSheetScrollView contentContainerStyle={styles.unlock}>
          {/* Rasterised: the source SVG nests 566 <svg> elements and crashes react-native-svg. */}
          <Image
            source={require('@/assets/images/market/rewardPro30d.png')}
            style={styles.unlockArt}
            resizeMode="contain"
          />
          <Text style={styles.title}>{t('Apply plan to your trip')}</Text>
          <Text style={styles.description}>
            {t('Unlock trip’s plan and apply to your current trip by choosing 1 of these 2 ways.')}
          </Text>
          <View style={styles.row}>
            <Button
              variant="dark"
              title={`${t('Redeem')} ⚡${shop?.price ?? 0}`}
              onPress={() => {
                pending.current = 'spark';
                unlock.current?.dismiss();
              }}
            />
            <Button
              title={t('Unlock with Pro')}
              onPress={() => {
                pending.current = 'pro';
                unlock.current?.dismiss();
              }}
            />
          </View>
        </BottomSheetScrollView>
      </AppSheet>
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

const HEADER_BUTTON = 40;
const STAR = '#FFD633';

function HeaderButton({
  label,
  icon,
  testID,
  onPress,
}: {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  testID: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      hitSlop={6}
      style={styles.headerShadow}
      onPress={onPress}
    >
      <GlassSurface preset="control" radius={999} style={styles.headerButton}>
        <Ionicons name={icon} size={20} color={colors.contentB} />
      </GlassSurface>
    </Pressable>
  );
}

/** Gradient capsule "Apply" (`MarketItemDetailView.swift:516`). */
function ApplyButton({
  title,
  disabled,
  onPress,
}: {
  title: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      testID="market-detail-apply"
      disabled={disabled}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.applyShadow,
        { opacity: disabled ? 0.6 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
      ]}
    >
      <LinearGradient
        colors={['#47BAFF', '#33A3FF']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.applyButton}
      >
        <Text style={styles.applyText}>{title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, overflow: 'hidden' },
  state: { flex: 1 },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerShadow: { borderRadius: 999, boxShadow: '0px 2px 6px rgba(0,0,0,0.10)' },
  headerButton: {
    width: HEADER_BUTTON,
    height: HEADER_BUTTON,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: 16 },
  hero: { alignItems: 'center', gap: 19 },
  titleBlock: { alignItems: 'center', gap: 8, alignSelf: 'stretch' },
  title: { ...beVietnamPro(20), letterSpacing: -1, color: colors.contentB, textAlign: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  dot: { width: 3.8, height: 3.8, borderRadius: 1.9, backgroundColor: colors.contentM },
  meta: { ...beVietnamPro(14), letterSpacing: -0.6, color: colors.contentM },
  caption: { ...beVietnamPro(12), letterSpacing: -0.5, color: colors.contentM },
  creator: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  creatorName: { ...beVietnamPro(14), letterSpacing: -0.7, color: colors.contentB },
  description: {
    ...beVietnamPro(13.40506),
    color: colors.neutral900,
    opacity: 0.7,
    textAlign: 'center',
  },
  listingDescription: { marginTop: 20 },
  plan: { marginTop: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  applyBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: colors.white,
    boxShadow: '0px 0px 17.9px rgba(0,0,0,0.06)',
  },
  applyCopy: { flex: 1, gap: 4 },
  applyTitle: { ...beVietnamPro(16), letterSpacing: -0.64, color: colors.contentB },
  applyShadow: { borderRadius: 999, marginRight: 8, boxShadow: '0px 1px 8px rgba(0,0,0,0.12)' },
  applyButton: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  applyText: { ...beVietnamPro(14), letterSpacing: -0.7, color: colors.white },
  unlockArt: { width: 150, height: 120, alignSelf: 'center' },
  unlock: {
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 12,
    alignItems: 'center',
    gap: 12,
  },
});
