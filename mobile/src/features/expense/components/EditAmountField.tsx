/**
 * Centred amount block of the Edit expense screen — port of `amountSection` + `currencyChip`
 * (`ios/OnePlan/OnePlan/View/Expense/EditExpenseView.swift:336-430`): a glass currency chip
 * (a native menu when there are two or more currencies), a 48pt centred amount on the system
 * decimal pad, and the FX caption underneath.
 */
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { applyLiveFormatting, type Currency } from '@/lib/currency';
import { AppMenuView, GlassSurface, SFSymbol, type AppMenuAction } from '@/ui/components';
import { clampForCurrency } from '@/ui/components/CurrencyInput';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

/** iOS focuses the field once the push animation settles. */
const AUTOFOCUS_DELAY_MS = 350;

export interface EditAmountFieldProps {
  /** Live-formatted text (`"1,234.5"`). */
  value: string;
  onChangeText: (text: string) => void;
  currency: Currency;
  currencies: readonly Currency[];
  onCurrencyChange: (currency: Currency) => void;
  /** Converted-amount line; blank keeps the row's height. */
  caption: string;
  testID?: string;
}

export function EditAmountField({
  value,
  onChangeText,
  currency,
  currencies,
  onCurrencyChange,
  caption,
  testID = 'edit-amount',
}: EditAmountFieldProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const inputRef = useRef<TextInput>(null);
  const canSwitch = currencies.length >= 2;

  useEffect(() => {
    const handle = setTimeout(() => inputRef.current?.focus(), AUTOFOCUS_DELAY_MS);
    return () => clearTimeout(handle);
  }, []);

  const pick = (code: string) => {
    const picked = currencies.find((c) => c.code === code);
    if (!picked || picked.code === currency.code) return;
    onCurrencyChange(picked);
    // Re-clamp a fraction the new currency can't hold (USD → VND), like AmountKeypadScreen.
    const clamped = clampForCurrency(value, picked);
    if (clamped !== value) onChangeText(clamped);
  };

  const chip = (
    <GlassSurface preset="control" radius={16} style={styles.chip}>
      <Text style={styles.chipText} numberOfLines={1}>
        {currency.code}
      </Text>
      {canSwitch ? (
        <SFSymbol
          name="chevron.down"
          fallback="chevron-down"
          size={9}
          frame={12}
          weight="600"
          color={colors.neutral900}
        />
      ) : null}
    </GlassSurface>
  );

  const actions: AppMenuAction[] = currencies.map((c) => ({
    id: c.code,
    title: `${c.name} (${c.code})`,
    state: c.code === currency.code ? 'on' : 'off',
  }));

  return (
    <View style={styles.root}>
      {canSwitch ? (
        <AppMenuView
          actions={actions}
          onPressAction={({ nativeEvent }) => pick(nativeEvent.event)}
          testID={`${testID}-currency`}
        >
          {chip}
        </AppMenuView>
      ) : (
        <View testID={`${testID}-currency`}>{chip}</View>
      )}

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(raw) => onChangeText(applyLiveFormatting(raw, currency.decimalPlaces))}
        keyboardType={currency.decimalPlaces > 0 ? 'decimal-pad' : 'number-pad'}
        placeholder="0"
        placeholderTextColor={colors.contentL}
        accessibilityLabel={t('Amount')}
        textAlign="center"
        numberOfLines={1}
        style={styles.amount}
        testID={testID}
      />

      <Text style={styles.caption} numberOfLines={1}>
        {caption || ' '}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 16 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: { ...beVietnamPro(16), letterSpacing: -0.32, color: colors.neutral900 },
  amount: {
    ...beVietnamPro(48),
    letterSpacing: -2.4,
    color: colors.neutral950,
    alignSelf: 'stretch',
    paddingHorizontal: 24,
    paddingVertical: 0,
  },
  caption: { ...beVietnamPro(14), letterSpacing: -0.56, color: colors.neutral600 },
});
