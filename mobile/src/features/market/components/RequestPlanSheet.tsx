/**
 * "Request a plan" — port of `Component/BottomSheet/RequestTripBottomSheet.swift`, presented from
 * the Market header like `MainView.swift:491-518` (detents 680/large, corner 44, Surface) with the
 * submit flow of `MainView.submitTripRequest`.
 */
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  type AccessibilityActionEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { ApiMutationError } from '@/api/mutationError';
import {
  LocationSearchSheet,
  type LocationSearchSheetRef,
} from '@/features/location/components/LocationSearchSheet';
import { locationTitle } from '@/features/location/helpers/locationLabel';
import {
  CurrencyPickerSheet,
  type CurrencyPickerSheetRef,
} from '@/features/trip/components/CurrencyPickerSheet';
import { useAppLanguage } from '@/i18n';
import { requireOnline } from '@/offline/guardOnline';
import { AppSheet, type AppSheetRef } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { useRequestPlan } from '../api/mutations';
import {
  DAY_RANGE,
  DEFAULT_REQUEST_PLAN_FORM,
  formatBudget,
  PARTICIPANT_RANGE,
  type RequestPlanForm,
  toCreateTripRequest,
} from '../helpers/requestPlanForm';
import { tagLabels } from './ListingCard';
import { TagPickerSheet, type TagPickerSheetRef } from './TagPickerSheet';

export interface RequestPlanSheetRef {
  present: () => void;
  dismiss: () => void;
}

/** SwiftUI `.height(680)` detent; `.large` ≈ full height below the status bar. */
const COMPACT_DETENT = 680;

export const RequestPlanSheet = forwardRef<RequestPlanSheetRef>(function RequestPlanSheet(_, ref) {
  useAppLanguage();
  const { t } = useTranslation();
  const { height } = useWindowDimensions();
  const sheetRef = useRef<AppSheetRef>(null);
  const locationSheet = useRef<LocationSearchSheetRef>(null);
  const tagSheet = useRef<TagPickerSheetRef>(null);
  const currencySheet = useRef<CurrencyPickerSheetRef>(null);
  const request = useRequestPlan();
  const busy = useRef(false);
  const [form, setForm] = useState<RequestPlanForm>(DEFAULT_REQUEST_PLAN_FORM);
  const update = (patch: Partial<RequestPlanForm>) => setForm((f) => ({ ...f, ...patch }));

  useImperativeHandle(ref, () => ({
    present: () => sheetRef.current?.present(),
    dismiss: () => sheetRef.current?.dismiss(),
  }));

  const large = Math.round(height * 0.94);
  const snapPoints = large > COMPACT_DETENT ? [COMPACT_DETENT, large] : [large];

  async function submit() {
    if (busy.current) return;
    const body = toCreateTripRequest(form);
    if (!body) {
      Alert.alert(
        t('Destination required'),
        t('Please choose where you want to go before submitting.'),
      );
      return;
    }
    if (!requireOnline(t)) return;
    busy.current = true;
    try {
      await request.mutateAsync(body);
      sheetRef.current?.dismiss();
      setForm(DEFAULT_REQUEST_PLAN_FORM);
      Alert.alert(
        t('Request submitted'),
        t("We'll send you a notification when the plan is available."),
      );
    } catch (error) {
      if (error instanceof ApiMutationError && error.status === 409) {
        Alert.alert(
          t('Request already open'),
          t('You already have an open request for this destination.'),
        );
      } else {
        Alert.alert(
          t('Something went wrong'),
          t("We couldn't submit your request. Please try again."),
        );
      }
    } finally {
      busy.current = false;
    }
  }

  const submitting = request.isPending;

  return (
    <>
      <AppSheet
        ref={sheetRef}
        snapPoints={snapPoints}
        backgroundRadius={44}
        backgroundColor={colors.surface}
        handleStyle={styles.handle}
        handleIndicatorStyle={styles.handleIndicator}
        footer={
          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Submit a request')}
              accessibilityState={{ disabled: submitting, busy: submitting }}
              disabled={submitting}
              testID="request-plan-submit"
              onPress={() => {
                void submit();
              }}
              style={({ pressed }) => [styles.submitShadow, pressed && styles.pressed]}
            >
              <LinearGradient colors={['#47BAFF', '#33ADF5']} style={styles.submit}>
                {submitting ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.submitText}>{t('Submit a request')}</Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t('Request a plan')}</Text>
          <Text style={styles.subtitle}>
            {t('Please fill in the form below to request new plan')}
          </Text>
        </View>
        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.content}
        >
          <PickerRow
            testID="request-plan-destination"
            text={form.destination ? locationTitle(form.destination) : t('Where will you go?')}
            isPlaceholder={!form.destination}
            onPress={() => locationSheet.current?.present()}
          />
          <PickerRow
            testID="request-plan-tag"
            text={t(tagLabels[form.tag])}
            onPress={() => tagSheet.current?.present()}
          />
          <View style={[styles.row, styles.budgetRow]}>
            <BottomSheetTextInput
              testID="request-plan-budget"
              accessibilityLabel={t('Your budget')}
              value={form.budgetText}
              onChangeText={(value) => update({ budgetText: formatBudget(value) })}
              placeholder={t('Your budget')}
              placeholderTextColor={colors.contentM}
              keyboardType="number-pad"
              style={[styles.rowText, styles.budgetInput]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={form.currency}
              testID="request-plan-currency"
              onPress={() => currencySheet.current?.present()}
              style={styles.currencyPill}
            >
              <Text style={styles.currencyText}>{form.currency}</Text>
              <Ionicons name="chevron-down" size={12} color={colors.white} />
            </Pressable>
          </View>
          <StepperRow
            testID="request-plan-people"
            title={
              form.participantCount === 1
                ? t('1 person')
                : t('%lld people', { count: form.participantCount })
            }
            value={form.participantCount}
            range={PARTICIPANT_RANGE}
            accessibilityLabel={t('Participants')}
            onChange={(participantCount) => update({ participantCount })}
          />
          <StepperRow
            testID="request-plan-days"
            title={form.dayCount === 1 ? t('1 day') : t('%lld days', { count: form.dayCount })}
            value={form.dayCount}
            range={DAY_RANGE}
            accessibilityLabel={t('Number of days')}
            onChange={(dayCount) => update({ dayCount })}
          />
          <BottomSheetTextInput
            testID="request-plan-description"
            multiline
            numberOfLines={3}
            value={form.description}
            onChangeText={(description) => update({ description })}
            placeholder={t('Describe your trip…')}
            placeholderTextColor={colors.contentM}
            autoCapitalize="sentences"
            style={[styles.rowText, styles.description]}
          />
          <Text style={styles.hint}>
            {t(
              "We'll send you notification when the plan is available. Please find it on Market after you received it.",
            )}
          </Text>
        </BottomSheetScrollView>
      </AppSheet>

      <LocationSearchSheet
        ref={locationSheet}
        onSelect={(destination) => update({ destination })}
      />
      <TagPickerSheet ref={tagSheet} selected={form.tag} onConfirm={(tag) => update({ tag })} />
      <CurrencyPickerSheet
        ref={currencySheet}
        selected={form.currency}
        stackBehavior="push"
        testIDPrefix="request-currency"
        onConfirm={(currency) => {
          if (currency) update({ currency });
        }}
      />
    </>
  );
});

function PickerRow({
  text,
  isPlaceholder = false,
  onPress,
  testID,
}: {
  text: string;
  isPlaceholder?: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      testID={testID}
      onPress={onPress}
      style={[styles.row, styles.pickerRow]}
    >
      <Text
        style={[styles.rowText, styles.fill, isPlaceholder && styles.placeholder]}
        numberOfLines={1}
      >
        {text}
      </Text>
      <Ionicons name="chevron-down" size={12} color={colors.contentB} />
    </Pressable>
  );
}

function StepperRow({
  title,
  value,
  range,
  accessibilityLabel,
  onChange,
  testID,
}: {
  title: string;
  value: number;
  range: { min: number; max: number };
  accessibilityLabel: string;
  onChange: (value: number) => void;
  testID: string;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const canDecrement = value > range.min;
  const canIncrement = value < range.max;
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment' && canIncrement) onChange(value + 1);
    if (event.nativeEvent.actionName === 'decrement' && canDecrement) onChange(value - 1);
  };
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ text: title }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAccessibilityAction}
      style={[styles.row, styles.stepperRow]}
    >
      <Text style={[styles.rowText, styles.fill]} numberOfLines={1}>
        {title}
      </Text>
      <StepperButton
        icon="remove"
        label={t('Decrease')}
        enabled={canDecrement}
        testID={`${testID}-decrement`}
        onPress={() => onChange(value - 1)}
      />
      <StepperButton
        icon="add"
        label={t('Increase')}
        enabled={canIncrement}
        testID={`${testID}-increment`}
        onPress={() => onChange(value + 1)}
      />
    </View>
  );
}

function StepperButton({
  icon,
  label,
  enabled,
  onPress,
  testID,
}: {
  icon: 'add' | 'remove';
  label: string;
  enabled: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!enabled}
      accessibilityState={{ disabled: !enabled }}
      onPress={onPress}
      style={styles.stepperButton}
    >
      <Ionicons name={icon} size={16} color={enabled ? colors.contentB : colors.contentM} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  handle: { paddingTop: 12, paddingBottom: 0 },
  handleIndicator: { width: 35, height: 5, backgroundColor: 'rgba(61, 61, 66, 0.3)' },
  header: {
    gap: 8,
    paddingTop: 20,
    paddingBottom: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  title: {
    ...beVietnamPro(20),
    color: colors.neutral950,
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  subtitle: {
    ...beVietnamPro(14),
    color: colors.neutral950,
    letterSpacing: -0.28,
    textAlign: 'center',
  },
  // Bottom padding clears the footer (52 button + 12 gap + 32 inset).
  content: { gap: 6, paddingHorizontal: 16, paddingBottom: 108 },
  row: {
    minHeight: 58,
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pickerRow: { gap: 8, paddingHorizontal: 20 },
  budgetRow: { gap: 8, paddingLeft: 20, paddingRight: 10 },
  stepperRow: { gap: 12, paddingLeft: 20, paddingRight: 10 },
  rowText: { ...beVietnamPro(16), color: colors.contentB, letterSpacing: -0.32 },
  placeholder: { color: colors.contentM },
  fill: { flex: 1 },
  budgetInput: { flex: 1, height: 58, paddingVertical: 0 },
  currencyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 13,
    borderCurve: 'continuous',
    backgroundColor: '#666666',
  },
  currencyText: { ...beVietnamPro(16), color: colors.white, letterSpacing: -0.32 },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 13,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // SwiftUI `lineLimit(3...6)`: ~3 lines tall, grows to 6 then scrolls.
  description: {
    minHeight: 58 + 2 * 22,
    maxHeight: 16 * 2 + 6 * 22,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: colors.background,
    textAlignVertical: 'top',
  },
  hint: {
    ...beVietnamPro(14),
    color: colors.contentM,
    letterSpacing: -0.28,
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    backgroundColor: colors.surface,
  },
  submitShadow: {
    borderRadius: 999,
    boxShadow: '0px 1px 8px rgba(0, 0, 0, 0.12)',
  },
  pressed: { opacity: 0.85 },
  submit: {
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: { ...beVietnamPro(17), color: colors.white, letterSpacing: -0.68 },
});
