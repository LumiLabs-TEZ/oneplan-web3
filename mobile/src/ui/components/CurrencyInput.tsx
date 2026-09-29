/**
 * Amount text field with live grouping — port of the text-field behaviour in
 * `ios/OnePlan/OnePlan/Component/Common/Currency/CurrencyInputField.swift` (the FX preview /
 * swap half of that view is out of scope here). The trailing currency chip opens a small sheet
 * when the caller offers two or more currencies.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  StyleSheet,
  type StyleProp,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';

import { useAppLanguage } from '@/i18n';
import { applyLiveFormatting, type Currency } from '@/lib/currency';
import { AppSheet, type AppSheetRef } from '@/ui/components/AppSheet';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface CurrencyInputProps {
  /** Live-formatted text (`"1,234.5"`). Parse with `lib/currency.parse`. */
  value: string;
  onChangeText: (text: string) => void;
  currency: Currency;
  /** Offer a currency switcher when two or more are given. */
  currencies?: readonly Currency[];
  onCurrencyChange?: (currency: Currency) => void;
  autoFocus?: boolean;
  /** Optional label rendered above the field (e.g. `t('Budget amount')`). */
  label?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Re-clamp text for a currency change: a 0-dp currency drops the fraction (USD → VND keeps
 * `"12"` from `"12.50"`, not `"1250"`), then the regular live formatter re-groups.
 */
export function clampForCurrency(text: string, currency: Currency): string {
  const dot = text.indexOf('.');
  const base = currency.decimalPlaces === 0 && dot >= 0 ? text.slice(0, dot) : text;
  return applyLiveFormatting(base, currency.decimalPlaces);
}

export function CurrencyInput({
  value,
  onChangeText,
  currency,
  currencies = [],
  onCurrencyChange,
  autoFocus,
  label,
  style,
  testID = 'currency-input',
}: CurrencyInputProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const sheetRef = useRef<AppSheetRef>(null);
  const canSwitch = currencies.length >= 2;

  const handleChange = (raw: string) => {
    onChangeText(applyLiveFormatting(raw, currency.decimalPlaces));
  };

  const handlePick = (picked: Currency) => {
    sheetRef.current?.dismiss();
    if (picked.code === currency.code) return;
    onCurrencyChange?.(picked);
    const clamped = clampForCurrency(value, picked);
    if (clamped !== value) onChangeText(clamped);
  };

  return (
    <View style={style}>
      {label ? (
        <Text style={styles.label} testID={`${testID}-label`}>
          {label}
        </Text>
      ) : null}
      <View style={styles.field}>
        <TextInput
          value={value}
          onChangeText={handleChange}
          keyboardType={currency.decimalPlaces > 0 ? 'decimal-pad' : 'number-pad'}
          placeholder="0"
          placeholderTextColor={colors.contentL}
          autoFocus={autoFocus}
          style={styles.input}
          testID={testID}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Currency')}
          accessibilityValue={{ text: currency.code }}
          disabled={!canSwitch}
          onPress={() => sheetRef.current?.present()}
          testID={`${testID}-currency`}
          style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
        >
          <Text style={styles.chipText}>{currency.code}</Text>
          {canSwitch ? <Ionicons name="chevron-down" size={12} color={colors.neutral950} /> : null}
        </Pressable>
        {canSwitch ? (
          <AppSheet ref={sheetRef} enableDynamicSizing>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>{t('Currency')}</Text>
              {currencies.map((option) => {
                const selected = option.code === currency.code;
                return (
                  <Pressable
                    key={option.code}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => handlePick(option)}
                    testID={`${testID}-option-${option.code}`}
                    style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                  >
                    <Text style={styles.rowCode}>{option.code}</Text>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {option.name}
                    </Text>
                    {selected ? (
                      <Ionicons name="checkmark-circle" size={20} color={colors.blueBase} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </AppSheet>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...beVietnamPro(16, 'medium'),
    letterSpacing: -0.32,
    color: colors.neutral600,
    marginBottom: spacing.sm,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 59,
    paddingLeft: spacing.xl,
    paddingRight: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    height: '100%',
    ...beVietnamPro(20, 'semibold'),
    letterSpacing: -0.4,
    color: colors.contentB,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  chipText: { ...beVietnamPro(14, 'semibold'), color: colors.neutral950 },
  pressed: { opacity: 0.7 },
  sheet: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxxl },
  sheetTitle: {
    ...beVietnamPro(20),
    letterSpacing: -0.8,
    color: colors.neutral950,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  rowCode: { ...beVietnamPro(16, 'semibold'), color: colors.contentB, width: 48 },
  rowName: { ...beVietnamPro(14), color: colors.contentM, flex: 1 },
});
