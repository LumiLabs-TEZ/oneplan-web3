/**
 * Edit plan item — port of `PlanFormView` edit path
 * (`ios/OnePlan/OnePlan/View/Plan/PlanFormView.swift`). Seeds from the already-fetched
 * `usePlanItem` (falling back to the trip's plan-items list while it loads) and offers
 * update + delete.
 */
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocationPickStore } from '@/features/location/locationPickStore';
import { PlanForm } from '@/features/plan/components/PlanForm';
import { RecordButton } from '@/features/plan/components/RecordButton';
import { RecordingOverlay } from '@/features/plan/components/RecordingOverlay';
import { usePlanItem } from '@/features/plan/api/queries';
import {
  availableDays,
  dateForDay,
  dayForDate,
  type DayContext,
} from '@/features/plan/helpers/planDays';
import {
  planningDayCountStore,
  usePlanningDayCountStore,
} from '@/features/plan/planningDayCountStore';
import { canSubmit, reduce, seedEdit } from '@/features/plan/planForm';
import type { PlanItemDto } from '@/features/plan/types';
import { useDayOps } from '@/features/plan/useDayOps';
import { usePlanFormAccessGuard } from '@/features/plan/usePlanFormAccessGuard';
import { usePlanSubmit } from '@/features/plan/usePlanSubmit';
import { useTripCore, useTripPlanItems } from '@/features/trip/TripDetailContext';
import { useAppLanguage } from '@/i18n';
import { useVoiceRecorder } from '@/native/audio';
import { GlassIconButton, SFSymbol, ScreenContainer, Spinner } from '@/ui/components';
import { BackButton } from '@/ui/components/BackButton';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export default function EditPlanItemScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ tripId: string; itemId: string }>();
  const itemId = Number(params.itemId);
  const detail = useTripCore();
  const { planItems: tripPlanItems } = useTripPlanItems();
  // Same stale-navigation guard as `plan/new.tsx` — the trip detail's own Edit button is
  // already hidden when `!access.canEdit`, this covers a route reached before that state landed.
  // `ready` keeps this from firing while the trip is still loading.
  const blocked = usePlanFormAccessGuard(
    { ready: !!detail.trip, canEdit: detail.access.canEdit },
    t,
  );
  const existing = tripPlanItems.find((p) => p.id === itemId);
  const query = usePlanItem(detail.tripId, itemId, existing ? { initialData: existing } : {});

  if (blocked || !detail.trip || !query.data) return <Spinner fill />;
  return <EditPlanItemForm key={query.data.id} item={query.data} />;
}

function EditPlanItemForm({ item }: { item: PlanItemDto }) {
  useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { tripId, trip, members } = useTripCore();
  const { planItems } = useTripPlanItems();

  const isPlanningMode = trip!.status === 'PLANNING';
  const acceptedMembers = members.filter((m) => m.inviteStatus === 'ACCEPTED');
  const acceptedIds = acceptedMembers.map((m) => m.userId);

  const ctx: DayContext = {
    isPlanningMode,
    startDate: trip!.startDate ?? null,
    endDate: trip!.endDate ?? null,
    planItems,
  };

  // Counter mode (planning trip, no scheduled dates): `availableDays` derives the day count from
  // `max(dayNumber)` across plan items, so a day added here (before any item lands on it) would
  // otherwise disappear the moment this screen re-renders. The counter itself is shared across
  // every screen editing this trip's schedule (`planningDayCountStore`, keyed by `tripId`) so a
  // day added from the Plan tab (`usePlanDay`) is visible here too, and vice versa.
  const storeDayCount = usePlanningDayCountStore((s) => s.get(tripId));
  const bumpLocalDayCount = (delta: number) => planningDayCountStore.bump(tripId, delta);
  const hasScheduledDates = !!ctx.startDate && !!ctx.endDate;
  const rawDays = availableDays(ctx);
  const days = hasScheduledDates
    ? rawDays
    : Array.from({ length: Math.max(rawDays.length, storeDayCount) }, (_, i) => i + 1);

  const [state, dispatch] = useReducer(reduce, undefined, () =>
    seedEdit(item, {
      isPlanningMode,
      tripStartDate: trip!.startDate ?? null,
      acceptedIds,
      initialDayNumber: isPlanningMode
        ? undefined
        : (dayForDate(trip!.startDate ?? null, item.planDate ?? null) ?? undefined),
    }),
  );

  const { submit, pending, error } = usePlanSubmit(tripId);
  const dayOps = useDayOps(tripId, { bumpLocalDayCount });
  const recorder = useVoiceRecorder();

  const handleDeleteDay = (day: number) => {
    const nextCount = Math.max(1, days.length - 1);
    const nextDay = Math.min(day, nextCount);
    dispatch({ type: 'day', value: nextDay });
    if (!isPlanningMode) {
      const date = dateForDay(ctx.startDate, nextDay);
      if (date) dispatch({ type: 'date', value: date });
    }
    void dayOps.deleteDay(ctx, day);
  };

  useFocusEffect(
    useCallback(() => {
      const picked = useLocationPickStore.getState().consume();
      if (picked) dispatch({ type: 'location', value: picked });
    }, []),
  );

  // Recording finished: hand the local file off to the form state and reset the recorder for
  // the next take (`voiceRecorded` seeds a `{ kind: 'new' }` slice — `usePlanSubmit` uploads it).
  useEffect(() => {
    if (recorder.status === 'recorded' && recorder.uri) {
      dispatch({ type: 'voiceRecorded', uri: recorder.uri, durationSec: recorder.seconds });
      recorder.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to `status`/`uri` flipping
  }, [recorder.status, recorder.uri]);

  useEffect(() => {
    if (recorder.error) {
      Alert.alert(t('Voice message unavailable'));
    }
  }, [recorder.error, t]);

  const hasVoice = state.voice.kind === 'new' || state.voice.kind === 'existing';

  const onDeleteVoice = () => {
    Alert.alert(t('Delete recording?'), t('The voice recording will be removed from this plan.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Delete'),
        style: 'destructive',
        onPress: () => {
          dispatch({ type: 'voiceDeleted' });
          recorder.reset();
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <View style={styles.root} pointerEvents={recorder.status === 'recording' ? 'none' : 'auto'}>
        <ScreenContainer edges={[]} style={styles.root}>
          <PlanForm
            contentTopInset={insets.top + 6 + HEADER_ROW + 8}
            state={state}
            dispatch={dispatch}
            acceptedMembers={acceptedMembers}
            days={days}
            ctx={ctx}
            onPickLocation={() =>
              router.push({
                pathname: '/trip/[tripId]/plan/location',
                params: { tripId: String(tripId), mode: 'pick' },
              })
            }
            onAddDay={() => void dayOps.addDay(ctx)}
            onDeleteDay={handleDeleteDay}
            canAddDay={days.length < 14}
            recorder={
              <RecordButton
                hasRecording={hasVoice}
                onPress={() => void recorder.start()}
                onDelete={hasVoice ? onDeleteVoice : undefined}
              />
            }
            footer={
              error ? (
                <Text style={styles.error} testID="plan-form-error">
                  {error}
                </Text>
              ) : undefined
            }
          />
        </ScreenContainer>
      </View>

      <RecordingOverlay
        topOffset={insets.top + 6 + HEADER_ROW}
        visible={recorder.status === 'recording'}
        title={state.name || t('Edit Plan')}
        seconds={recorder.seconds}
        bars={recorder.bars}
        onStop={() => void recorder.stop()}
        onClose={() => void recorder.stop()}
      />

      {/* Glass back + ✓ only, no nav title — iOS `PlanFormView` edit toolbar. Floats over the
          scrolling form like the tab screens' `AppHeader` (iOS toolbar); rendered
          last so it stays sharp above the recording blur, and inert while recording. */}
      <View
        style={[styles.header, { paddingTop: insets.top + 6 }]}
        pointerEvents={recorder.status === 'recording' ? 'none' : 'box-none'}
      >
        <BackButton />
        <GlassIconButton
          label={t('Update Plan')}
          onPress={() => void submit(state, acceptedIds)}
          disabled={!canSubmit(state) || pending}
          testID="plan-update"
        >
          {pending ? (
            <Spinner size="small" />
          ) : (
            <SFSymbol
              name="checkmark"
              fallback="checkmark"
              size={16}
              frame={22}
              weight="600"
              color={colors.contentB}
            />
          )}
        </GlassIconButton>
      </View>
    </View>
  );
}

/** Glass header buttons are 40pt. */
const HEADER_ROW = 40;

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  error: { ...beVietnamPro(13), color: colors.warning500, textAlign: 'center' },
});
