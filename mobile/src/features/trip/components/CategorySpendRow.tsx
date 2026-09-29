/**
 * Single category-spend row rendered flat on the Insight gray container (no card): 43×43
 * illustration + title + right-aligned amount with NO space before the currency symbol
 * (`TripInsightSection.swift:229-267`, `categorySpendingList` / `categoryAmountText`).
 */
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { categoryOption } from '@/features/expense/categories';
import { useAppLanguage } from '@/i18n';
import { type Currency } from '@/lib/currency';
import { MoneyText } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import type { CategorySpend } from '../helpers/insightModel';

const ICON_SIZE = 43;

export interface CategorySpendRowProps {
  spend: CategorySpend;
  currency: Currency;
}

export function CategorySpendRow({ spend, currency }: CategorySpendRowProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const option = categoryOption(spend.category);
  const Icon = option.Icon;

  return (
    <View style={styles.row} testID={`category-spend-row-${spend.category}`}>
      <Icon width={ICON_SIZE} height={ICON_SIZE} />
      <Text style={styles.title} numberOfLines={1}>
        {t(option.title)}
      </Text>
      <MoneyText
        amount={spend.amount}
        currency={currency}
        symbolPosition="suffix"
        style={styles.amount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...beVietnamPro(16), letterSpacing: -0.32, color: colors.contentB, flex: 1 },
  amount: { ...beVietnamPro(16), letterSpacing: -0.32, color: colors.contentB },
});
