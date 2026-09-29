/**
 * Add expense — port of `ios/OnePlan/OnePlan/View/Expense/AddExpenseView.swift` +
 * `Component/Common/AmountKeypadScreen.swift` (shared shell: `AmountEntryScreen`). Custom back
 * header with the Pro-gated "Scan bill" pill, currency chip (when ≥2 display
 * currencies), 48pt amount, live FX caption, keypad card and "Next". "Next" snapshots
 * `{amount, currency}` before presenting the details sheet (`AddExpenseView.swift:36-45`), whose
 * submit creates the expense and pops the screen.
 */
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { useConvertedAmount } from '@/features/exchange/useExchangeRate';
import { useCreateExpense, expenseErrorMessage } from '@/features/expense/api/mutations';
import {
  AddExpenseDetailsSheet,
  type AddExpenseDetailsSheetRef,
  ScanBillButton,
} from '@/features/expense/components';
import { type DetailsFormState, toCreateBody } from '@/features/expense/detailsFormReducer';
import {
  amountValue,
  initialKeypadState,
  keypadReducer,
} from '@/features/expense/keypad/keypadReducer';
import { useRequirePro } from '@/features/subscription/useRequirePro';
import { displayCurrencies } from '@/features/trip/helpers/tripCurrencyRules';
import { useTripCore } from '@/features/trip/TripDetailContext';
import { useAppLanguage } from '@/i18n';
import { type Currency, currencyFromCode, format } from '@/lib/currency';
import { AmountEntryScreen } from '@/ui/components';

export default function AddExpenseScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const detail = useTripCore();
  const { requirePro } = useRequirePro();
  const { tripId, homeCurrency, trip, members } = detail;

  const locals = (trip?.localCurrencies ?? [])
    .map((c) => currencyFromCode(c))
    .filter((c): c is Currency => Boolean(c));
  const currencies = displayCurrencies(homeCurrency, locals);
  const initialCurrency = locals[0] ?? homeCurrency;

  const [keypad, dispatch] = useReducer(keypadReducer, initialKeypadState(initialCurrency));
  const amount = amountValue(keypad);
  const [payload, setPayload] = useState<{ amount: number; currency: Currency } | null>(null);
  const sheetRef = useRef<AddExpenseDetailsSheetRef>(null);
  const create = useCreateExpense(tripId);

  // Caption converts into the home currency, or the first other currency when typing in home.
  const counterpart =
    keypad.currency.code !== homeCurrency.code
      ? homeCurrency
      : currencies.find((c) => c.code !== keypad.currency.code);
  const converted = useConvertedAmount(amount, keypad.currency.code, counterpart?.code);
  const caption =
    counterpart && amount > 0 && converted.amount != null
      ? `≈ ${format(converted.amount, counterpart)}`
      : ' ';

  const onNext = () => {
    setPayload({ amount, currency: keypad.currency });
    sheetRef.current?.present();
  };

  const onSubmit = async (form: DetailsFormState): Promise<boolean> => {
    if (!payload) return false;
    try {
      await create.mutateAsync(
        toCreateBody({
          form,
          members,
          amount: payload.amount,
          enteredCurrency: payload.currency,
          homeCurrency,
          displayCurrencies: currencies,
          now: new Date(),
          fallbackName: t('Expense'),
        }),
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
      return true;
    } catch (e) {
      Alert.alert(
        t('Failed to create expense'),
        expenseErrorMessage(e, t('Failed to create expense')),
      );
      return false;
    }
  };

  const onScanBill = () => {
    requirePro(() => {
      router.push({ pathname: '/trip/[tripId]/expense/scan', params: { tripId: String(tripId) } });
    });
  };

  return (
    <AmountEntryScreen
      onBack={() => router.back()}
      trailingAccessory={<ScanBillButton onPress={onScanBill} />}
      caption={caption}
      keypad={keypad}
      dispatch={dispatch}
      currencies={currencies}
      onNext={onNext}
    >
      <AddExpenseDetailsSheet
        ref={sheetRef}
        members={members}
        onSubmit={onSubmit}
        onDismiss={() => setPayload(null)}
      />
    </AmountEntryScreen>
  );
}
