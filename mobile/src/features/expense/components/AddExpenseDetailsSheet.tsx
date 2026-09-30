/**
 * Details step of the add-expense flow — port of
 * `ios/OnePlan/OnePlan/View/Expense/AddExpenseDetailsSheet.swift` (detent 519). Owns the
 * `detailsFormReducer` state; the caller maps the submitted state to `CreateExpenseDto` via
 * `toCreateBody` and reports success so the sheet knows whether to dismiss.
 */
import { forwardRef, useImperativeHandle, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { components } from '@/api/schema';
import type { ExpenseCategory } from '@/features/expense/categories';
import {
  acceptedMemberIds,
  canSubmit,
  type DetailsFormAction,
  type DetailsFormState,
  detailsFormReducer,
  initialDetailsForm,
} from '@/features/expense/detailsFormReducer';
import { useAppLanguage } from '@/i18n';
import { AppSheet, type AppSheetRef, Button } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { ExpenseCategoryPickerSheet, useExpenseCategoryPicker } from './ExpenseCategoryPickerSheet';
import { ExpenseFormFields } from './ExpenseFormFields';

type TripMemberDto = components['schemas']['TripMemberDto'];

export const ADD_EXPENSE_DETAILS_SHEET_HEIGHT = 519;

export interface AddExpenseDetailsSheetProps {
  members: readonly TripMemberDto[];
  initialCategory?: ExpenseCategory;
  /**
   * Resolve `true` when the expense saved (sheet dismisses and resets) or `false` to keep the
   * sheet open with the user's input intact.
   */
  onSubmit: (state: DetailsFormState) => Promise<boolean>;
  onDismiss?: () => void;
}

export interface AddExpenseDetailsSheetRef {
  /** Resets the form, then presents the sheet. */
  present: () => void;
  dismiss: () => void;
  /** Restore the initial form (name empty, initial category, group payer, all members). */
  reset: () => void;
}

type FormAction = DetailsFormAction | { type: 'reset'; state: DetailsFormState };

function formReducer(state: DetailsFormState, action: FormAction): DetailsFormState {
  return action.type === 'reset' ? action.state : detailsFormReducer(state, action);
}

export const AddExpenseDetailsSheet = forwardRef<
  AddExpenseDetailsSheetRef,
  AddExpenseDetailsSheetProps
>(function AddExpenseDetailsSheet({ members, initialCategory, onSubmit, onDismiss }, ref) {
  useAppLanguage();
  const { t } = useTranslation();
  const sheetRef = useRef<AppSheetRef>(null);
  const picker = useExpenseCategoryPicker();
  const initial = () => initialDetailsForm({ category: initialCategory ?? 'FOOD' });
  const [state, dispatch] = useReducer(formReducer, undefined, initial);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const reset = () => dispatch({ type: 'reset', state: initial() });

  useImperativeHandle(ref, () => ({
    present: () => {
      reset();
      sheetRef.current?.present();
    },
    dismiss: () => sheetRef.current?.dismiss(),
    reset,
  }));

  const submittable = canSubmit(state, acceptedMemberIds(members));

  const handleDone = async () => {
    if (submittingRef.current || !submittable) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const saved = await onSubmit(state);
      if (saved) {
        sheetRef.current?.dismiss();
        reset();
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <AppSheet
      ref={sheetRef}
      snapPoints={[ADD_EXPENSE_DETAILS_SHEET_HEIGHT]}
      onDismiss={() => {
        reset();
        onDismiss?.();
      }}
    >
      <View style={styles.container} testID="add-expense-details-sheet">
        <Text style={styles.title}>{t('Add new expenses')}</Text>
        <ExpenseFormFields
          state={state}
          dispatch={dispatch}
          members={members}
          onPickCategory={picker.open}
        />
        <View style={styles.spacer} />
        {/* TODO(keyboard): the button sits behind the keyboard while the name field is focused;
            the return key ("done") dismisses it. BottomSheetFooter did not lift with
            keyboardBehavior="interactive" at a fixed snap point — revisit with a scrollable body. */}
        <Button
          title={submitting ? t('Saving…') : t('Done')}
          disabled={!submittable}
          loading={submitting}
          onPress={() => void handleDone()}
          testID="details-done"
        />
      </View>
      <ExpenseCategoryPickerSheet
        ref={picker.ref}
        value={state.category}
        onSelect={(category) => dispatch({ type: 'setCategory', category })}
        nested
      />
    </AppSheet>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  title: {
    ...beVietnamPro(20),
    letterSpacing: -0.8,
    color: colors.neutral950,
    textAlign: 'center',
  },
  spacer: { flex: 1 },
});
