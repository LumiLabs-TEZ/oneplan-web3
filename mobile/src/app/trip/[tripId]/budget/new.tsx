/**
 * Add budget — port of `ios/OnePlan/OnePlan/View/Budget/AddBudgetView.swift` +
 * `AddBudgetDetailsSheet.swift` (shared shell: `AmountEntryScreen`). Differs from the expense
 * flow only in the trailing "Balance" pill and the static "Per person" caption (each contributor
 * is charged the FULL entered amount, not a split) — and, per `AddBudgetView.swift:57`, the
 * keypad always starts in the trip's HOME currency (expense starts in the first local currency).
 * "Next" snapshots `{amount, currency}` before presenting the details sheet, whose submit
 * creates the budget and pops the screen.
 */
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { useCreateBudget } from '@/features/budget/api/mutations';
import { type BudgetFormState, toCreateBudgetBody } from '@/features/budget/budgetFormReducer';
import { AddBudgetDetailsSheet, type AddBudgetDetailsSheetRef } from '@/features/budget/components';
import { mutationErrorMessage } from '@/api/mutationError';
import {
  amountValue,
  initialKeypadState,
  keypadReducer,
} from '@/features/expense/keypad/keypadReducer';
import { tripMoney } from '@/features/trip/helpers/tripMoney';
import { displayCurrencies } from '@/features/trip/helpers/tripCurrencyRules';
import { useTripBudgets, useTripCore, useTripExpenses } from '@/features/trip/TripDetailContext';
import { useAppLanguage } from '@/i18n';
import { type Currency, currencyFromCode } from '@/lib/currency';
import { AmountEntryScreen, GlassSurface, NumericText } from '@/ui/components';
import { beVietnamPro } from '@/ui/typography';
import { colors } from '@/ui/theme';

export default function AddBudgetScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const detail = useTripCore();
  const { tripId, homeCurrency, trip, members } = detail;
  const budgets = useTripBudgets();
  const { expenses } = useTripExpenses();

  const locals = (trip?.localCurrencies ?? [])
    .map((c) => currencyFromCode(c))
    .filter((c): c is Currency => Boolean(c));
  const currencies = displayCurrencies(homeCurrency, locals);

  // `AddBudgetView.swift:57` — the budget keypad always starts in the trip's home currency,
  // unlike the expense keypad which defaults to the first local currency.
  const [keypad, dispatch] = useReducer(keypadReducer, initialKeypadState(homeCurrency));
  const amount = amountValue(keypad);
  const [payload, setPayload] = useState<{ amount: number; currency: Currency } | null>(null);
  const sheetRef = useRef<AddBudgetDetailsSheetRef>(null);
  const create = useCreateBudget(tripId);

  const balance = tripMoney(budgets, expenses).balance;

  const onNext = () => {
    setPayload({ amount, currency: keypad.currency });
    sheetRef.current?.present();
  };

  const onSubmit = async (form: BudgetFormState): Promise<boolean> => {
    if (!payload || !trip) return false;
    try {
      const acceptedIds = members.filter((m) => m.inviteStatus === 'ACCEPTED').map((m) => m.userId);
      await create.mutateAsync(
        toCreateBudgetBody(
          form,
          { amount: payload.amount, currency: payload.currency, trip },
          acceptedIds,
        ),
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
      return true;
    } catch (e) {
      Alert.alert(
        t('Failed to create budget'),
        mutationErrorMessage(e, t('Failed to create budget')),
      );
      return false;
    }
  };

  return (
    <AmountEntryScreen
      onBack={() => router.back()}
      trailingAccessory={
        // Same glass + drop shadow as `BackPillButton` so the pair reads as one row.
        <View style={styles.balanceShadow}>
          <GlassSurface preset="control" radius={999} style={styles.balancePill}>
            {/* `formatWhole` truncates toward zero; the label rides along as the prefix. */}
            <NumericText
              value={Math.trunc(balance)}
              prefix={`${t('Balance')} `}
              style={styles.balanceText}
            />
          </GlassSurface>
        </View>
      }
      caption={t('Per person')}
      keypad={keypad}
      dispatch={dispatch}
      currencies={currencies}
      onNext={onNext}
    >
      <AddBudgetDetailsSheet
        ref={sheetRef}
        members={members}
        perPersonAmount={amount}
        currency={keypad.currency}
        currentBalance={balance}
        onSubmit={onSubmit}
        onDismiss={() => setPayload(null)}
      />
    </AmountEntryScreen>
  );
}

const styles = StyleSheet.create({
  balanceShadow: { borderRadius: 999, boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.12)' },
  balancePill: { paddingHorizontal: 12, paddingVertical: 8 },
  balanceText: { ...beVietnamPro(15, 'regular'), letterSpacing: -0.3, color: colors.neutral900 },
});
