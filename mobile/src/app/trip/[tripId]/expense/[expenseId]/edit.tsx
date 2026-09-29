/**
 * Edit expense — port of `ios/OnePlan/OnePlan/View/Expense/EditExpenseView.swift`.
 * Seeds a draft from the full `ExpenseDto` (`seedEditExpense`), edits amount/currency, time,
 * category/name, payer and split, and PATCHes only the dirty fields (`buildUpdateBody`) so the
 * server keeps the stored conversion and share split for untouched rows. Leaving with a dirty
 * draft asks for confirmation.
 */
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useConvertedAmount } from '@/features/exchange/useExchangeRate';
import { expenseErrorMessage, useUpdateExpense } from '@/features/expense/api/mutations';
import {
  EditAmountField,
  ExpenseCategoryPickerSheet,
  ExpenseFormFields,
} from '@/features/expense/components';
import {
  acceptedMemberIds,
  type DetailsFormAction,
  type DetailsFormState,
  detailsFormReducer,
  shareMemberIds,
} from '@/features/expense/detailsFormReducer';
import {
  buildUpdateBody,
  type EditExpenseDraft,
  isEditDirty,
  seedEditExpense,
} from '@/features/expense/editExpenseDiff';
import { formatEditExpenseTime } from '@/features/expense/helpers/expenseDetailModel';
import { classifyQueryError, useExpenseDetail } from '@/features/trip/api/queries';
import { displayCurrencies } from '@/features/trip/helpers/tripCurrencyRules';
import { useTripCore } from '@/features/trip/TripDetailContext';
import { useAppLanguage } from '@/i18n';
import { type Currency, currencyFromCode, format, parse } from '@/lib/currency';
import {
  AppSheet,
  BackPillButton,
  type AppSheetRef,
  Button,
  EmptyState,
  Spinner,
} from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import type { ExpenseDto } from '@/features/trip/types';

const DATE_SHEET_HEIGHT = 360;

export default function EditExpenseScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tripId: string; expenseId: string }>();
  const expenseId = Number(params.expenseId);
  const { tripId } = useTripCore();
  const query = useExpenseDetail(tripId, expenseId);

  if (query.isPending) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
        <Spinner fill />
      </View>
    );
  }
  if (query.isError || !query.data) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
        <EmptyState
          title={t('Failed to load expense details')}
          body={query.error ? classifyQueryError(query.error).message : undefined}
          action={{ label: t('Retry'), onPress: () => void query.refetch() }}
          style={styles.fill}
        />
      </View>
    );
  }
  // Keyed so a different expense re-seeds the baseline; a refetch of the same id does not.
  return <EditExpenseForm key={query.data.id} expense={query.data} />;
}

function EditExpenseForm({ expense }: { expense: ExpenseDto }) {
  useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const navigation = useNavigation();
  const { tripId, trip, members, homeCurrency } = useTripCore();
  const update = useUpdateExpense(tripId, expense.id);

  // Baseline is captured once per mount (iOS captures it in `init`).
  const [baseline] = useState(() => seedEditExpense(expense, members, homeCurrency));
  const [draft, setDraft] = useState<EditExpenseDraft>(baseline.draft);
  const dirty = isEditDirty(baseline, draft);
  const leaveAllowed = useRef(false);

  const dateSheet = useRef<AppSheetRef>(null);
  const categoryPicker = useRef<AppSheetRef>(null);

  // Home + locals, plus the row's original currency when the trip has since dropped it
  // (`EditExpenseView.swift:297-303`).
  const locals = (trip?.localCurrencies ?? [])
    .map((c) => currencyFromCode(c))
    .filter((c): c is Currency => Boolean(c));
  const base = displayCurrencies(homeCurrency, locals);
  const currencies = base.some((c) => c.code === baseline.currency.code)
    ? base
    : [...base, baseline.currency];

  const amount = parse(draft.amountText, draft.currency.decimalPlaces);
  const counterpart =
    draft.currency.code !== homeCurrency.code
      ? homeCurrency
      : currencies.find((c) => c.code !== draft.currency.code);
  const converted = useConvertedAmount(amount, draft.currency.code, counterpart?.code);
  const caption =
    counterpart && amount > 0 && converted.amount != null
      ? format(converted.amount, counterpart)
      : '';

  // `EditExpenseView.canSave`: Done is live whenever the draft is valid, dirty or not — an
  // unchanged draft just pops (see `onSave`).
  const canSave =
    draft.name.trim().length > 0 &&
    amount > 0 &&
    shareMemberIds(draft.shareMode, acceptedMemberIds(members)).length > 0;

  const formState: DetailsFormState = {
    name: draft.name,
    category: draft.category,
    shareMode: draft.shareMode,
    paidBy: draft.paidBy,
  };
  const dispatchForm = (action: DetailsFormAction) =>
    setDraft((d) => ({
      ...d,
      ...detailsFormReducer(
        { name: d.name, category: d.category, shareMode: d.shareMode, paidBy: d.paidBy },
        action,
      ),
    }));

  // Dirty draft → confirm before the screen is popped (back button, swipe, hardware back).
  useEffect(() => {
    if (!dirty) return;
    return navigation.addListener('beforeRemove', (e) => {
      if (leaveAllowed.current) return;
      e.preventDefault();
      Alert.alert(t('Discard changes?'), undefined, [
        { text: t('Keep editing'), style: 'cancel' },
        {
          text: t('Discard'),
          style: 'destructive',
          onPress: () => navigation.dispatch(e.data.action),
        },
      ]);
    });
  }, [dirty, navigation, t]);

  // Seeded from the server ISO string, so this only falls back for corrupted input.
  const parsedMs = Date.parse(draft.expenseDate);
  const expenseDate = new Date(Number.isNaN(parsedMs) ? 0 : parsedMs);
  const setExpenseDate = (date: Date) =>
    setDraft((d) => ({ ...d, expenseDate: date.toISOString() }));

  const openDatePicker = () => {
    Keyboard.dismiss();
    if (Platform.OS === 'android') {
      // Two-step native dialogs: date, then time.
      DateTimePickerAndroid.open({
        value: expenseDate,
        mode: 'date',
        display: 'spinner',
        onChange: (dateEvent, picked) => {
          if (dateEvent.type !== 'set' || !picked) return;
          DateTimePickerAndroid.open({
            value: picked,
            mode: 'time',
            display: 'spinner',
            onChange: (timeEvent, withTime) => {
              if (timeEvent.type === 'set' && withTime) setExpenseDate(withTime);
            },
          });
        },
      });
      return;
    }
    dateSheet.current?.present();
  };

  const onPickerChange = (_event: DateTimePickerEvent, date?: Date) => {
    if (date) setExpenseDate(date);
  };

  const onSave = async () => {
    Keyboard.dismiss();
    if (draft.name.trim().length === 0) {
      Alert.alert(t('Error'), t('Expense name is required.'));
      return;
    }
    if (!(amount > 0)) {
      Alert.alert(t('Error'), t('Expense amount must be greater than 0.'));
      return;
    }
    if (shareMemberIds(draft.shareMode, acceptedMemberIds(members)).length === 0) {
      Alert.alert(t('Error'), t('Expense must be shared with at least one member.'));
      return;
    }
    const body = buildUpdateBody({ baseline, draft, members, homeCurrency, note: expense.note });
    leaveAllowed.current = true;
    if (!body) {
      router.back();
      return;
    }
    try {
      await update.mutateAsync(body);
      router.back();
    } catch (e) {
      leaveAllowed.current = false;
      Alert.alert(t('Error'), expenseErrorMessage(e, t('Failed to update expense')));
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top + 8 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <BackPillButton onPress={() => router.back()} />
      </View>

      {/* iOS layout: amount ~12% down, a flexible gap pushing the details low, Done last. */}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ height: Math.max(40, screenHeight * 0.12) }} />

        <EditAmountField
          value={draft.amountText}
          onChangeText={(text) => setDraft((d) => ({ ...d, amountText: text }))}
          currency={draft.currency}
          currencies={currencies}
          onCurrencyChange={(currency) => setDraft((d) => ({ ...d, currency }))}
          caption={caption}
        />

        <View style={styles.flexGap} />

        <View style={styles.details}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Time')}
            onPress={openDatePicker}
            style={styles.timeRow}
            testID="edit-time-row"
          >
            <Text style={styles.timeLabel}>{t('Time')}</Text>
            <Text style={styles.timeValue} numberOfLines={1}>
              {formatEditExpenseTime(draft.expenseDate)}
            </Text>
          </Pressable>

          <ExpenseFormFields
            state={formState}
            dispatch={dispatchForm}
            members={members}
            fieldFill={colors.surface}
            nameFieldFill={colors.surface}
            onPickCategory={() => {
              Keyboard.dismiss();
              categoryPicker.current?.present();
            }}
          />
        </View>

        <Button
          variant="primary"
          title={t('Done')}
          onPress={() => void onSave()}
          disabled={!canSave}
          loading={update.isPending}
          style={styles.done}
          testID="edit-save"
        />
      </ScrollView>

      <ExpenseCategoryPickerSheet
        ref={categoryPicker}
        value={draft.category}
        onSelect={(category) => dispatchForm({ type: 'setCategory', category })}
      />

      {Platform.OS === 'ios' ? (
        <AppSheet ref={dateSheet} snapPoints={[DATE_SHEET_HEIGHT]}>
          <View style={styles.dateSheet}>
            <Text style={styles.dateTitle}>{t('Select Date & Time')}</Text>
            <DateTimePicker
              value={expenseDate}
              mode="datetime"
              display="spinner"
              onChange={onPickerChange}
              style={styles.datePicker}
              testID="edit-date-picker"
            />
            <Button
              variant="primary"
              title={t('Done')}
              onPress={() => dateSheet.current?.dismiss()}
              style={styles.dateDone}
            />
          </View>
        </AppSheet>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  content: { flexGrow: 1 },
  flexGap: { flexGrow: 1, minHeight: 32 },
  details: { paddingHorizontal: 16, gap: 16 },
  done: { marginTop: 16, marginHorizontal: 24 },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderRadius: 20,
  },
  timeLabel: { ...beVietnamPro(15), letterSpacing: -0.3, color: colors.contentM },
  timeValue: { ...beVietnamPro(16), letterSpacing: -0.32, color: colors.contentB, flexShrink: 1 },
  dateSheet: { flex: 1, alignItems: 'stretch', paddingHorizontal: spacing.lg, gap: spacing.sm },
  dateTitle: {
    ...beVietnamPro(16, 'medium'),
    color: colors.contentB,
    textAlign: 'center',
    paddingTop: spacing.sm,
  },
  datePicker: { height: 200 },
  dateDone: { marginTop: 'auto', marginBottom: spacing.lg },
});
