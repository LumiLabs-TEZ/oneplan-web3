/**
 * Plan item detail — port of `ios/OnePlan/OnePlan/View/Plan/PlanDetailView.swift`.
 * Glass back button; a big centred plan title floating in the free space; Edit/Delete circles
 * (hidden when the trip is read-only) above the history card
 * (time, blue map card + Direction pill when the plan has coordinates, location, who join,
 * message — voice badge slot lands in M4.2), and a Prev/Next strip driven by `daySiblings`.
 * The map preview/voice playback themselves land in M2.6/M4.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { Href } from 'expo-router';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePlanItem } from '@/features/plan/api/queries';
import { PlanDetailHistoryCard, PrevNextStrip, WaveformBars } from '@/features/plan/components';
import { usePlayableVoice } from '@/features/plan/components/PlanItemVoice';
import { formatDuration } from '@/features/plan/helpers/timeLabel';
import { openDirections, presentMapsChooser } from '@/features/plan/helpers/openInMaps';
import {
  membersLabel,
  messageLabel,
  planTimeAndDate,
  planTitle,
} from '@/features/plan/helpers/planDetailLabels';
import { daySiblings, prevNext } from '@/features/plan/helpers/siblings';
import type { PlanItemDto } from '@/features/plan/types';
import { useStalePlanItemsRefetch } from '@/features/plan/useStalePlanItemsRefetch';
import { useDeletePlanItem } from '@/features/trip/api/mutations';
import { classifyQueryError } from '@/features/trip/api/queries';
import { useTripCore, useTripPlanItems } from '@/features/trip/TripDetailContext';
import { useAppLanguage } from '@/i18n';
import { staticBars } from '@/native/audio';
import { EmptyState, SFSymbol, Spinner } from '@/ui/components';
import { BackButton } from '@/ui/components/BackButton';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const DELETE_RED = '#FF5959';
const DELETE_FILL = '#FCE8E8';

export default function PlanItemDetailScreen() {
  const locale = useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tripId: string; itemId: string }>();
  const itemId = Number(params.itemId);
  const { tripId, access, trip } = useTripCore();
  const { planItems } = useTripPlanItems();
  const isPlanningMode = trip?.status === 'PLANNING';

  // Plan items can go stale while this detail screen sits behind another screen (e.g. after an
  // edit made from the Plan tab); refetch on focus when the cache is old enough.
  useStalePlanItemsRefetch(tripId);

  const initialData = planItems.find((i) => i.id === itemId);
  const query = usePlanItem(tripId, itemId, { initialData });
  const remove = useDeletePlanItem(tripId);

  const item = query.data;
  const siblings = item ? daySiblings(planItems, item, isPlanningMode) : [];
  const { prev, next } = prevNext(siblings, itemId);
  const voice = usePlayableVoice(item?.voiceUrl ?? null);

  const goTo = (sibling: PlanItemDto) => router.setParams({ itemId: String(sibling.id) });

  const onEdit = () => {
    router.push({
      // M2.3 route
      pathname: '/trip/[tripId]/plan/[itemId]/edit',
      params: { tripId: String(tripId), itemId: String(itemId) },
    } as unknown as Href);
  };

  const onDelete = () => {
    if (remove.isPending) return;
    Alert.alert(t('Delete plan?'), t('This plan will be permanently removed from the trip.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await remove.mutateAsync(itemId);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          } catch {
            Alert.alert(t('Delete failed'), t('Failed to delete plan.'));
          }
        },
      },
    ]);
  };

  let body: React.ReactNode;
  if (query.isPending) {
    body = <Spinner fill />;
  } else if (query.isError || !item) {
    body = (
      <EmptyState
        title={t('Failed to load plan items')}
        body={query.error ? classifyQueryError(query.error).message : undefined}
        action={{ label: t('Retry'), onPress: () => void query.refetch() }}
        style={styles.fill}
      />
    );
  } else {
    const location = (item.location ?? '').trim() || t('Not set');
    const locationName = (item.location ?? '').trim() || planTitle(item, t);
    const locationCoordinate =
      typeof item.latitude === 'number' && typeof item.longitude === 'number'
        ? { latitude: item.latitude, longitude: item.longitude }
        : null;

    const onDirectionPress = () => {
      if (!locationCoordinate) return;
      presentMapsChooser(t, (choice) => {
        void openDirections(
          {
            destination: locationCoordinate,
            mode: 'car',
            name: locationName,
            address: item.address,
          },
          choice,
          t,
        );
      });
    };

    const onLocationPress = () => {
      if (!locationCoordinate) return;
      router.push({
        pathname: '/trip/[tripId]/plan/location',
        params: {
          tripId: String(tripId),
          mode: 'view',
          name: locationName,
          lat: String(locationCoordinate.latitude),
          lng: String(locationCoordinate.longitude),
          address: item.address ?? '',
          category: item.category ?? '',
        },
      } as unknown as Href);
    };

    const hasVoice =
      typeof item.voiceDuration === 'number' && item.voiceDuration > 0 && item.voiceUrl;

    const onToggleVoice = () => {
      if (voice.isError) {
        Alert.alert(t('Unable to play voice message.'));
        return;
      }
      voice.toggle();
    };

    body = (
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* iOS `VStack { Spacer; title; Spacer; actions + card + strip }`. */}
        <View style={styles.spacer} />
        <View style={styles.titleBlock}>
          <Text style={styles.titleLabel}>{t('Plan name')}</Text>
          <Text style={styles.title} testID="plan-detail-title">
            {planTitle(item, t)}
          </Text>
        </View>
        <View style={styles.spacer} />

        <View style={styles.bottomBlock}>
          {access.canEdit ? (
            <View style={styles.actions}>
              <ActionItem
                label={t('Edit')}
                onPress={onEdit}
                icon={
                  <SFSymbol name="pencil" fallback="pencil" size={16} color={colors.contentB} />
                }
                fill={colors.onSurface}
                testID="plan-detail-edit"
              />
              <ActionItem
                label={t('Delete')}
                onPress={onDelete}
                disabled={remove.isPending}
                icon={
                  <SFSymbol name="trash" fallback="trash-outline" size={16} color={DELETE_RED} />
                }
                fill={DELETE_FILL}
                testID="plan-detail-delete"
              />
            </View>
          ) : null}

          <PlanDetailHistoryCard
            timeAndDate={planTimeAndDate(item, isPlanningMode, locale, t)}
            locationCoordinate={locationCoordinate}
            locationName={locationName}
            location={location}
            whoJoin={membersLabel(item, t)}
            message={messageLabel(item, t)}
            audioBadge={
              hasVoice ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={onToggleVoice}
                  style={styles.audioBadge}
                  testID="plan-detail-audio"
                >
                  <Ionicons
                    name={voice.playing ? 'pause' : 'play'}
                    size={12}
                    color={colors.blueBase}
                  />
                  <WaveformBars values={staticBars(item.id)} count={24} color={colors.blueBase} />
                  <Text style={styles.audioDuration}>
                    {formatDuration(item.voiceDuration ?? 0)}
                  </Text>
                </Pressable>
              ) : undefined
            }
            onDirectionPress={onDirectionPress}
            onLocationPress={onLocationPress}
          />

          <PrevNextStrip prev={prev} next={next} onPrev={goTo} onNext={goTo} />
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <BackButton />
      </View>
      {body}
    </View>
  );
}

/** `PlanDetailActionItem` (`PlanDetailView.swift:388-416`): 44pt circle + label underneath. */
function ActionItem({
  label,
  icon,
  fill,
  onPress,
  disabled = false,
  testID,
}: {
  label: string;
  icon: React.ReactNode;
  fill: string;
  onPress: () => void;
  disabled?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.actionItem}
      testID={testID}
    >
      <View style={[styles.actionCircle, { backgroundColor: fill }]}>{icon}</View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  content: { paddingHorizontal: spacing.lg, flexGrow: 1 },
  spacer: { flexGrow: 1 },
  titleBlock: { alignItems: 'center', gap: 8, paddingVertical: 20 },
  titleLabel: { ...beVietnamPro(14), color: colors.contentB, textAlign: 'center' },
  title: { ...beVietnamPro(36), color: colors.contentB, textAlign: 'center', paddingBottom: 32 },
  bottomBlock: { gap: 10 },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  actionItem: { alignItems: 'center', gap: 6 },
  actionCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { ...beVietnamPro(14), letterSpacing: -0.6, color: colors.contentB },
  audioBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: 140,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.blueAlpha10,
  },
  audioDuration: { ...beVietnamPro(13), color: colors.blueBase },
});
