/**
 * New plan item — port of `AddPlanItemView`/`PlanFormView` create path
 * (`ios/OnePlan/OnePlan/View/Plan/PlanFormView.swift`). `TripPlanSection`'s "New Plan" button and
 * the day chip strip's empty-state action push here with `{ tripId, day?, date? }`.
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
import { canSubmit, reduce, seedCreate } from '@/features/plan/planForm';
import { useDayOps } from '@/features/plan/useDayOps';
import { usePlanFormAccessGuard } from '@/features/plan/usePlanFormAccessGuard';
import { usePlanSubmit } from '@/features/plan/usePlanSubmit';
import { useTripCore, useTripPlanItems } from '@/features/trip/TripDetailContext';
import { useAppLanguage } from '@/i18n';
import { useVoiceRecorder } from '@/native/audio';
import { Button, ScreenContainer, Spinner } from '@/ui/components';
import { BackButton } from '@/ui/components/BackButton';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export default function NewPlanItemScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const detail = useTripCore();
  // A stale deep link/backgrounded tab could reach this route after the trip flips offline/ended
  // (`TripPlanSection`'s "New Plan" button and the day chips' "+ add" already hide it, but a
  // route push racing that state change can still land here). `ready` keeps this from firing
  // while the trip is still loading (`canEdit` reads `false` before `detail.trip` exists).
  const blocked = usePlanFormAccessGuard(
    { ready: !!detail.trip, canEdit: detail.access.canEdit },
    t,
  );
  if (blocked || !detail.trip) return <Spinner fill />;
  return <NewPlanItemForm />;
}

function NewPlanItemForm() {
  useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tripId: string; day?: string; date?: string }>();
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

  const initialDay = params.day
    ? Number(params.day)
    : (dayForDate(ctx.startDate, params.date ?? null) ?? days[0] ?? 1);

  const [state, dispatch] = useReducer(reduce, undefined, () =>
    seedCreate({
      isPlanningMode,
      tripStartDate: trip!.startDate ?? null,
      day: initialDay,
      date: params.date ?? null,
      acceptedIds,
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

  const handleDeleteVoice = () => {
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
                onDelete={hasVoice ? handleDeleteVoice : undefined}
              />
            }
            footer={
              <View style={styles.footer}>
                <Button
                  title={pending ? t('Saving...') : t('Save Plan')}
                  disabled={!canSubmit(state) || pending}
                  loading={pending}
                  onPress={() => void submit(state, acceptedIds)}
                  testID="plan-save"
                />
                {error ? (
                  <Text style={styles.error} testID="plan-form-error">
                    {error}
                  </Text>
                ) : null}
              </View>
            }
          />
        </ScreenContainer>
      </View>

      <RecordingOverlay
        topOffset={insets.top + 6 + HEADER_ROW}
        visible={recorder.status === 'recording'}
        title={state.name || t('New Plan')}
        seconds={recorder.seconds}
        bars={recorder.bars}
        onStop={() => void recorder.stop()}
        onClose={() => void recorder.stop()}
      />

      {/* Floats over the scrolling form like the tab screens' `AppHeader` (iOS toolbar); rendered
          last so it stays sharp above the recording blur, and inert while recording. */}
      <View
        style={[styles.header, { paddingTop: insets.top + 6 }]}
        pointerEvents={recorder.status === 'recording' ? 'none' : 'box-none'}
      >
        <BackButton />
      </View>
    </View>
  );
}

/** Glass header buttons are 40pt. */
const HEADER_ROW = 40;

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Glass back button only — no nav title (iOS `PlanFormView` sets none).
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
  footer: { gap: spacing.sm },
  error: { ...beVietnamPro(13), color: colors.warning500, textAlign: 'center' },
});
