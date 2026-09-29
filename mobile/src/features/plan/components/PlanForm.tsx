/**
 * Create/edit plan-item form body — port of `PlanFormView`
 * (`ios/OnePlan/OnePlan/View/Plan/PlanFormView.swift:35-179`, header :192-213, location row
 * :324-338). Day-add/day-delete and location picking are supplied by the caller (`onAddDay`,
 * `onDeleteDay`, `onPickLocation`) — this task wires the plumbing, later tasks (M2.4/M3.3)
 * implement the actual day-ops and location-search screens. `recorder`/`footer` are render-prop
 * slots so the screen owns the voice-record UI (M4) and the primary action button(s).
 */
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { components } from '@/api/schema';
import { formatMonthDay, parseDateOnly } from '@/features/trip/helpers/dateRange';
import { useAppLanguage } from '@/i18n';
import { NumericText } from '@/ui/components/NumericText';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { dateForDay, type DayContext } from '../helpers/planDays';
import {
  isBeforeTripStart,
  remainingImageSlots,
  type PlanFormAction,
  type PlanFormState,
} from '../planForm';
import { PhotosSection } from './PhotosSection';
import { PlanFormDayChips } from './PlanFormDayChips';
import { TimeRow } from './TimeRow';
import { WhoJoinSection } from './WhoJoinSection';

type TripMemberDto = components['schemas']['TripMemberDto'];

const DESCRIPTION_MAX = 500;

export interface PlanFormProps {
  state: PlanFormState;
  dispatch: (action: PlanFormAction) => void;
  acceptedMembers: readonly TripMemberDto[];
  days: readonly number[];
  ctx: DayContext;
  onPickLocation: () => void;
  onAddDay?: () => void;
  onDeleteDay?: (day: number) => void;
  canAddDay: boolean;
  /** Voice-record slot — no-op until M4 wires `AudioRecordingManager`. */
  recorder?: ReactNode;
  /** Create mode: the inline Save button. Edit mode has no inline submit button (iOS
   * `PlanFormView.swift:64-80` — update/delete live in the screen's header toolbar instead), so
   * this is only an error-message slot there; omit entirely when there's nothing to show. */
  footer?: ReactNode;
  /** Top padding for the scroll content — the screens' floating header height. */
  contentTopInset?: number;
}

export function PlanForm({
  state,
  dispatch,
  acceptedMembers,
  days,
  ctx,
  onPickLocation,
  onAddDay,
  onDeleteDay,
  canAddDay,
  recorder,
  footer,
  contentTopInset = 0,
}: PlanFormProps) {
  const locale = useAppLanguage();
  const { t } = useTranslation();

  const onSelectDay = (day: number) => {
    dispatch({ type: 'day', value: day });
    if (!state.isPlanningMode) {
      const date = dateForDay(ctx.startDate, day);
      if (date) dispatch({ type: 'date', value: date });
    }
  };

  const beforeStart = isBeforeTripStart(state);
  const remainingSlots = remainingImageSlots(state);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: contentTopInset }]}
      scrollIndicatorInsets={{ top: contentTopInset }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      testID="plan-form"
    >
      <View style={styles.header}>
        <Text style={styles.headerLabel}>{t('Plan name')}</Text>
        <TextInput
          value={state.name}
          onChangeText={(value) => dispatch({ type: 'name', value })}
          placeholder={t('Enter name')}
          placeholderTextColor={colors.contentL}
          style={styles.nameInput}
          textAlign="center"
          multiline
          testID="plan-name"
        />
      </View>

      <View style={styles.body}>
        <PlanFormDayChips
          ctx={ctx}
          days={days}
          selected={state.dayNumber}
          onSelect={onSelectDay}
          onAddDay={onAddDay}
          onDeleteDay={onDeleteDay}
          canAddDay={canAddDay}
          locale={locale}
        />

        <TimeRow
          hour={state.time.hour}
          minute={state.time.minute}
          onChange={(time) => dispatch({ type: 'time', value: time })}
        />

        <Pressable
          accessibilityRole="button"
          onPress={onPickLocation}
          style={styles.locationRow}
          testID="plan-location-row"
        >
          <Text style={styles.rowLabel}>{t('Location')}</Text>
          <View style={styles.locationValueRow}>
            <Text
              style={[styles.rowValue, !state.location.text && styles.rowValuePlaceholder]}
              numberOfLines={1}
            >
              {state.location.text || t('Choose')}
            </Text>
            {state.location.text ? (
              <Pressable
                accessibilityLabel={t('Remove')}
                onPress={() => dispatch({ type: 'location', value: null })}
                testID="plan-location-clear"
              >
                <Ionicons name="close-circle" size={18} color={colors.contentL} />
              </Pressable>
            ) : null}
          </View>
        </Pressable>

        {beforeStart && state.tripStartDate ? (
          <Text style={styles.warning}>
            {t('Plan date cannot be before trip start date (%@).', {
              0: formatMonthDay(parseDateOnly(state.tripStartDate), locale),
            })}
          </Text>
        ) : null}

        <WhoJoinSection
          style={styles.whoJoin}
          acceptedMembers={acceptedMembers}
          members={state.members}
          onToggleMember={(id) =>
            dispatch({
              type: 'toggleMember',
              id,
              acceptedIds: acceptedMembers.map((m) => m.userId),
            })
          }
          onSelectAll={() => dispatch({ type: 'selectAll' })}
        />

        <PhotosSection
          style={styles.spacedCard}
          existingImageUrls={state.existingImageUrls}
          newImageUris={state.newImageUris}
          remainingSlots={remainingSlots}
          onAddImages={(uris) => dispatch({ type: 'addImages', uris })}
          onRemoveExisting={(index) => dispatch({ type: 'removeExisting', index })}
          onRemoveNew={(index) => dispatch({ type: 'removeNew', index })}
        />

        <View style={[styles.messageCard, styles.spacedCard]}>
          <View style={styles.messageHeader}>
            <Text style={styles.rowLabel}>{t('Message')}</Text>
            {recorder}
          </View>
          <TextInput
            value={state.description}
            onChangeText={(value) => dispatch({ type: 'description', value })}
            placeholder={t('Note')}
            placeholderTextColor={colors.contentL}
            multiline
            maxLength={DESCRIPTION_MAX}
            style={styles.messageInput}
            testID="plan-message"
          />
          <NumericText
            value={state.description.length}
            suffix={`/${DESCRIPTION_MAX}`}
            style={styles.counter}
          />
        </View>
      </View>

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: spacing.xxxl },
  header: { alignItems: 'center', paddingVertical: spacing.xl, gap: 8 },
  headerLabel: { ...beVietnamPro(14), color: colors.contentB },
  nameInput: {
    ...beVietnamPro(36),
    color: colors.contentB,
    minWidth: 200,
    paddingBottom: spacing.xxl,
  },
  // `VStack(spacing: 4)`; who-join sits 8 lower, photos/message 6 lower (`PlanFormView.swift:39-62`).
  body: { paddingHorizontal: spacing.lg, gap: 4 },
  whoJoin: { marginTop: 8 },
  spacedCard: { marginTop: 6 },
  rowLabel: { ...beVietnamPro(14), color: colors.contentM },
  rowValue: { ...beVietnamPro(16), color: colors.contentB, flexShrink: 1 },
  rowValuePlaceholder: { ...beVietnamPro(16, 'light'), color: colors.contentL },
  // `PlanFormInfoRow`: white 48pt card, radius 20 — same as `TimeRow`.
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.white,
  },
  locationValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  warning: { ...beVietnamPro(13), color: colors.warning500 },
  messageCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    gap: 8,
  },
  messageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  messageInput: {
    ...beVietnamPro(16, 'light'),
    color: colors.contentB,
    minHeight: 95,
    textAlignVertical: 'top',
  },
  counter: { ...beVietnamPro(14), color: colors.contentL, textAlign: 'right' },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
});
