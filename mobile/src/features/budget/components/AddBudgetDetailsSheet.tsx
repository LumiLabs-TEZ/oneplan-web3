/**
 * Details step of the add-budget flow — port of
 * `ios/OnePlan/OnePlan/View/Budget/AddBudgetDetailsSheet.swift` (detent 519). Owns the
 * `budgetFormReducer` state; the caller maps the submitted state to `CreateBudgetDto` via
 * `toCreateBudgetBody` and reports success so the sheet knows whether to dismiss.
 */
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { components } from '@/api/schema';
import {
  type BudgetFormState,
  canSubmitBudget,
  contributorIdsToSave,
  initialBudgetForm,
  projectedBalance,
  setBudgetName,
} from '@/features/budget/budgetFormReducer';
import { useAppLanguage } from '@/i18n';
import type { Currency } from '@/lib/currency';
import { AppSheet, type AppSheetRef, Button, MoneyText } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { ContributorChips } from './ContributorChips';

type TripMemberDto = components['schemas']['TripMemberDto'];

export const ADD_BUDGET_DETAILS_SHEET_HEIGHT = 519;

export interface AddBudgetDetailsSheetProps {
  members: readonly TripMemberDto[];
  /** Amount entered on the keypad step, charged to EACH contributor. */
  perPersonAmount: number;
  currency: Currency;
  currentBalance: number;
  /**
   * Resolve `true` when the budget saved (sheet dismisses and resets) or `false` to keep the
   * sheet open with the user's input intact.
   */
  onSubmit: (state: BudgetFormState) => Promise<boolean>;
  onDismiss?: () => void;
}

export interface AddBudgetDetailsSheetRef {
  present: () => void;
  dismiss: () => void;
  reset: () => void;
}

export const AddBudgetDetailsSheet = forwardRef<
  AddBudgetDetailsSheetRef,
  AddBudgetDetailsSheetProps
>(function AddBudgetDetailsSheet(
  { members, perPersonAmount, currency, currentBalance, onSubmit, onDismiss },
  ref,
) {
  useAppLanguage();
  const { t } = useTranslation();
  const sheetRef = useRef<AppSheetRef>(null);
  const [state, setState] = useState<BudgetFormState>(() => initialBudgetForm());
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const reset = () => setState(initialBudgetForm());

  useImperativeHandle(ref, () => ({
    present: () => {
      reset();
      sheetRef.current?.present();
    },
    dismiss: () => sheetRef.current?.dismiss(),
    reset,
  }));

  const accepted = members.filter((m) => m.inviteStatus === 'ACCEPTED');
  const acceptedIds = accepted.map((m) => m.userId);
  const contributorCount = contributorIdsToSave(state, acceptedIds).length;
  const balance = projectedBalance(currentBalance, perPersonAmount, contributorCount);
  const submittable = canSubmitBudget(state, acceptedIds);

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
      snapPoints={[ADD_BUDGET_DETAILS_SHEET_HEIGHT]}
      onDismiss={() => {
        reset();
        onDismiss?.();
      }}
    >
      <View style={styles.container} testID="add-budget-details-sheet">
        <Text style={styles.title}>{t('Add new budget')}</Text>

        <TextInput
          value={state.name}
          onChangeText={(name) => setState((s) => setBudgetName(s, name))}
          placeholder={t('Budget name')}
          placeholderTextColor={colors.contentL}
          maxLength={255}
          returnKeyType="done"
          style={styles.nameInput}
          testID="budget-name-input"
        />

        <ContributorChips
          members={accepted}
          contributors={state.contributors}
          onChange={(contributors) => setState((s) => ({ ...s, contributors }))}
          testIDPrefix="contributor-chip"
        />

        <View style={styles.projectedRow}>
          <Text style={styles.projectedLabel}>
            {t("The group's new balance after contributing will be")}
          </Text>
          <MoneyText
            amount={balance}
            currency={currency}
            showDecimals={false}
            minimumFontScale={0.5}
            style={styles.projectedAmount}
            testID="budget-projected-balance"
          />
        </View>

        <View style={styles.spacer} />
        <Button
          title={submitting ? t('Saving…') : t('Done')}
          disabled={!submittable}
          loading={submitting}
          onPress={() => void handleDone()}
          testID="budget-details-done"
        />
      </View>
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
  nameInput: {
    height: 59,
    paddingHorizontal: spacing.xl,
    borderRadius: 20,
    backgroundColor: colors.background,
    ...beVietnamPro(16),
    letterSpacing: -0.32,
    color: colors.contentB,
  },
  projectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: 14,
    backgroundColor: colors.blueAlpha10,
  },
  projectedLabel: {
    flex: 1,
    ...beVietnamPro(14),
    letterSpacing: -0.28,
    color: colors.neutral600,
  },
  projectedAmount: {
    ...beVietnamPro(20, 'medium'),
    letterSpacing: -0.4,
    color: colors.blueBase,
  },
  spacer: { flex: 1 },
});
