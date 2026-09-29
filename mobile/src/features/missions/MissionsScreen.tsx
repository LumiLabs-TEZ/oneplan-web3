import { BlurTargetView } from 'expo-blur';
import { openReview } from './helpers/review';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMissionsTransport } from './api/transport';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useWindowDimensions,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView as NativeScrollView,
  Text,
  View,
} from 'react-native';
// The sheet wraps its content in a pan handler; only the gesture-handler ScrollView can take a
// horizontal drag from it (gorhom troubleshooting: nested horizontal lists).
import { ScrollView } from 'react-native-gesture-handler';
import { keys } from '@/api/keys';
import { mutationErrorMessage } from '@/api/mutationError';
import { useIsPro } from '@/features/subscription/api/queries';
import { useAppLanguage } from '@/i18n';
import { requireOnline } from '@/offline/guardOnline';
import { AppSheet, type AppSheetRef } from '@/ui/components/AppSheet';
import { beVietnamPro } from '@/ui/typography';
import { reportMissionEvent, useMissions, type Reward } from './api/queries';
import { useRedeem } from './api/useRedeem';
import { isRewardId } from './catalog';
import { RedemptionError } from './helpers/redemption';
import { missionDestination } from './helpers/destination';
import { missionRowFromDto } from './helpers/missionRow';
import { RedeemSheet, SuccessSheet, type RedeemItem, type Success } from './RewardSheets';
import { NumericText } from '@/ui/components/NumericText';
import { DashedDivider, MissionAction, RewardCard, SparkChip, styles } from './RewardViews';
import { RewardsTerms } from './RewardsTerms';

type Child =
  { kind: 'terms' } | { kind: 'redeem'; item: RedeemItem } | { kind: 'success'; success: Success };
export default function MissionsScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height, fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  // A disabled nested ScrollView still constrains its content height. Let the main sheet own
  // vertical scrolling when rewards are stacked for accessibility text sizes.
  const RewardsContainer = largeText ? View : ScrollView;
  // Accessibility sheets use a fixed full-height detent and native content scrolling.
  const MainScrollView = largeText ? NativeScrollView : BottomSheetScrollView;
  const { source = 'home' } = useLocalSearchParams<{ source?: string }>();
  const transport = useMissionsTransport();
  const query = useMissions();
  const redeem = useRedeem();
  const client = useQueryClient();
  const isPro = useIsPro(transport);
  const mainBackdrop = useRef<View>(null);
  const main = useRef<AppSheetRef>(null);
  const nested = useRef<AppSheetRef>(null);
  const [child, setChild] = useState<Child | null>(null);
  const nextChild = useRef<Child | null>(null);
  const destination = useRef<Href | null>(null);
  const closeAfterChild = useRef(false);
  const submitted = useRef(false);
  const viewed = useRef(false);
  const [presented, setPresented] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const reviewing = useRef(false);
  useEffect(() => {
    main.current?.present();
  }, []);
  // Report the view once it can actually reach the server; an offline open retries after the
  // overview loads (Retry), so the "view the missions sheet" spark is not lost for the mount.
  function reportViewed() {
    if (viewed.current || !onlineManager.isOnline()) return;
    viewed.current = true;
    void reportMissionEvent({ event: 'missions_sheet_viewed', source }, transport).catch(() => {
      viewed.current = false;
    });
  }
  useEffect(() => {
    if (presented && query.isSuccess) reportViewed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presented, query.isSuccess, query.dataUpdatedAt]);
  useEffect(() => {
    if (child) nested.current?.present();
  }, [child]);
  /** Screens translate the runner's client-side refusals; server errors keep their own text. */
  function redemptionMessage(error: unknown, fallback: string) {
    if (!(error instanceof RedemptionError)) return mutationErrorMessage(error, fallback);
    if (error.code === 'offline') return t('Please check your connection and try again.');
    return t('Could not redeem this reward');
  }
  function leave(href: Href | null) {
    if (redeem.isPending) return;
    destination.current = href;
    if (child) {
      closeAfterChild.current = true;
      nested.current?.dismiss();
    } else main.current?.dismiss();
  }
  function childDismissed() {
    if (nextChild.current) {
      const next = nextChild.current;
      nextChild.current = null;
      setChild(next);
    } else setChild(null);
    if (closeAfterChild.current) {
      closeAfterChild.current = false;
      main.current?.dismiss();
    }
  }
  async function missionTap(id: string) {
    if (redeem.isPending) return;
    if (id !== 'appstore_review') {
      leave(missionDestination(id, isPro));
      return;
    }
    if (!requireOnline(t)) return;
    if (reviewing.current) return;
    reviewing.current = true;
    try {
      await openReview(Platform.OS, Linking.openURL, () =>
        reportMissionEvent(
          { event: 'appstore_review_opened', source: 'missions_sheet' },
          transport,
        ),
      );
      await client.invalidateQueries({ queryKey: keys.missions });
    } catch (error) {
      Alert.alert(t('Error'), mutationErrorMessage(error, t('Please try again.')));
    } finally {
      reviewing.current = false;
    }
  }
  function rewardTap(item: Reward) {
    if (redeem.isPending || !isRewardId(item.itemId) || !item.available) return;
    if (item.itemId === 'market_unlock') {
      leave('/(tabs)/market');
      return;
    }
    if (item.itemId.startsWith('pro_') && isPro) {
      Alert.alert(
        t("You're already Pro"),
        t('You can redeem Pro rewards after your current Pro subscription expires.'),
      );
      return;
    }
    setChild({ kind: 'redeem', item: { ...item, itemId: item.itemId } });
  }
  async function submit(item: RedeemItem, quantity: number) {
    if (submitted.current || !requireOnline(t)) return;
    submitted.current = true;
    try {
      const outcome = await redeem.mutateAsync({ itemId: item.itemId, quantity });
      const result = outcome.confirmed.at(-1);
      if (outcome.error)
        Alert.alert(
          t('Could not redeem this reward'),
          redemptionMessage(outcome.error, t('Please check your connection and try again.')),
        );
      if (result) {
        nextChild.current = {
          kind: 'success',
          success: { item, quantity: outcome.confirmed.length, result },
        };
        nested.current?.dismiss();
      }
    } catch (error) {
      Alert.alert(
        t('Could not redeem this reward'),
        redemptionMessage(error, t('Please try again.')),
      );
    } finally {
      submitted.current = false;
    }
  }
  return (
    <>
      <AppSheet
        preset="missions"
        ref={main}
        onChange={(index) => {
          if (index < 0) return;
          setPresented(true);
          reportViewed();
        }}
        // Pin the detent to the container top (position 0) instead of `window − inset`: the
        // container is measured inside the transparent modal after `present()`, and a sheet that
        // settles even slightly off gorhom's "extended" position keeps its scroll view locked.
        topInset={insets.top}
        snapPoints={['100%']}
        enableContentPanningGesture={!largeText}
        enablePanDownToClose={!redeem.isPending}
        dismissOnBackdropPress={!redeem.isPending}
        onDismiss={() => {
          if (!mounted.current) return;
          const href = destination.current;
          if (href) router.replace(href);
          else if (router.canGoBack()) router.back();
          else router.replace('/(tabs)/home');
        }}
        footer={
          largeText ? undefined : (
            <View style={{ paddingBottom: insets.bottom, backgroundColor: 'white' }}>
              <DashedDivider />
              <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
                <MissionAction
                  title={t('Get Unlimited Access')}
                  disabled={redeem.isPending}
                  onPress={() =>
                    leave({ pathname: '/paywall', params: { source: 'missions_sheet' } })
                  }
                />
              </View>
            </View>
          )
        }
      >
        <BlurTargetView
          ref={mainBackdrop}
          // Scrolling needs a bounded viewport (sheet height minus the 24pt handle). With `flex: 1`,
          // a cached overview renders before gorhom sizes the sheet and the wrapper grows to the
          // whole list on Android, leaving nothing to scroll.
          style={{ height: height - insets.top - 24 }}
        >
          <MainScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 12,
              paddingTop: 4,
              paddingBottom: largeText ? insets.bottom + 24 : 120,
            }}
          >
            <View
              testID={presented ? 'missions-ready' : undefined}
              style={[
                styles.header,
                { paddingRight: 8 },
                largeText && { flexDirection: 'column', alignItems: 'flex-start' },
              ]}
            >
              <Image
                source={require('../../../assets/images/missions/rewardTrophy.png')}
                style={{ width: 45, height: 45 }}
                contentFit="contain"
              />
              <View style={{ flex: largeText ? undefined : 1, gap: 4 }}>
                <Text accessibilityRole="header" style={styles.title}>
                  {t('Missions')}
                </Text>
                <Text style={styles.label}>{t('Earned via missions')}</Text>
              </View>
              <SparkChip dark>
                <NumericText
                  value={query.data?.balance ?? 0}
                  style={[styles.chipText, { color: 'white' }]}
                />
              </SparkChip>
            </View>
            {query.isPending && query.fetchStatus !== 'paused' ? (
              <ActivityIndicator style={{ padding: 40 }} accessibilityLabel={t('Loading...')} />
            ) : null}
            {query.isError || query.fetchStatus === 'paused' ? (
              <View style={{ paddingVertical: 20, gap: 12 }}>
                <Text style={styles.label}>
                  {t(
                    query.fetchStatus === 'paused'
                      ? 'Please check your connection and try again.'
                      : 'Failed to load missions',
                  )}
                </Text>
                <MissionAction
                  title={t('Retry')}
                  testID="missions-retry"
                  onPress={() => {
                    void query.refetch();
                  }}
                />
              </View>
            ) : null}
            <RewardsContainer
              {...(largeText
                ? { style: { marginTop: 16, gap: 12 } }
                : {
                    horizontal: true,
                    showsHorizontalScrollIndicator: false,
                    style: { marginTop: 16, marginRight: -12 },
                    contentContainerStyle: { gap: 12 },
                  })}
            >
              {query.data?.shopItems.map((item) =>
                isRewardId(item.itemId) ? (
                  <RewardCard
                    key={item.itemId}
                    item={{ ...item, itemId: item.itemId }}
                    onPress={() => rewardTap(item)}
                  />
                ) : null,
              )}
            </RewardsContainer>
            <Text
              style={{ ...beVietnamPro(16), color: '#999999', marginTop: 24, marginBottom: 11 }}
            >
              {t('Missions')}
            </Text>
            <View style={{ gap: 6 }}>
              {query.data?.missions.map((dto) => {
                const row = missionRowFromDto(dto, t);
                if (!row) return null;
                return (
                  <Pressable
                    key={row.id}
                    testID={`mission-${row.id}`}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: row.completed }}
                    disabled={row.completed}
                    onPress={() => {
                      void missionTap(row.id);
                    }}
                    style={{
                      flexDirection: largeText ? 'column' : 'row',
                      alignItems: largeText ? 'flex-start' : 'center',
                      gap: 12,
                      padding: 12,
                      backgroundColor: '#F7F7F7',
                      borderRadius: 20,
                    }}
                  >
                    <View style={{ flex: largeText ? undefined : 1, gap: 4 }}>
                      <Text style={{ ...beVietnamPro(15), letterSpacing: -0.3, color: '#363636' }}>
                        {row.title}
                      </Text>
                      <Text style={styles.subtitle}>{row.subtitle}</Text>
                    </View>
                    <SparkChip
                      trailingBolt
                      claimed={row.completed}
                      bolt={!row.completed}
                      prefix="+"
                    >
                      {row.completed ? t('Claimed') : row.reward}
                    </SparkChip>
                  </Pressable>
                );
              })}
            </View>
            {query.data && !query.data.missions.some((dto) => missionRowFromDto(dto)) ? (
              <Text style={styles.label}>{t('No missions available')}</Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={redeem.isPending}
              onPress={() => setChild({ kind: 'terms' })}
              style={{ marginTop: 11 }}
            >
              <Text style={styles.label}>{t('Rewards Program Terms')}</Text>
            </Pressable>
            {largeText ? (
              <View style={{ marginTop: 24 }}>
                <MissionAction
                  title={t('Get Unlimited Access')}
                  disabled={redeem.isPending}
                  onPress={() =>
                    leave({ pathname: '/paywall', params: { source: 'missions_sheet' } })
                  }
                />
              </View>
            ) : null}
          </MainScrollView>
        </BlurTargetView>
      </AppSheet>
      {child ? (
        <AppSheet
          preset={
            child.kind === 'terms'
              ? 'rewardsTerms'
              : child.kind === 'redeem'
                ? 'rewardRedemption'
                : 'rewardSuccess'
          }
          blurTarget={mainBackdrop}
          enableContentPanningGesture={!largeText}
          {...(largeText ? { snapPoints: [height - insets.top] } : {})}
          key={child.kind}
          ref={nested}
          onDismiss={childDismissed}
          enablePanDownToClose={!redeem.isPending}
          dismissOnBackdropPress={!redeem.isPending}
        >
          {child.kind === 'terms' ? (
            <RewardsTerms dismiss={() => nested.current?.dismiss()} />
          ) : child.kind === 'redeem' ? (
            <RedeemSheet
              item={{
                ...child.item,
                ...query.data?.shopItems.find((item) => item.itemId === child.item.itemId),
                itemId: child.item.itemId,
              }}
              balance={query.data?.balance ?? 0}
              pending={redeem.isPending}
              submit={(quantity) => {
                void submit(child.item, quantity);
              }}
            />
          ) : (
            <SuccessSheet
              success={child.success}
              more={() => nested.current?.dismiss()}
              primary={() =>
                leave(child.success.item.itemId === 'scan_credit_1' ? '/(tabs)/board' : null)
              }
            />
          )}
        </AppSheet>
      ) : null}
    </>
  );
}
