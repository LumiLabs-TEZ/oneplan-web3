/**
 * Trip detail "Insight" tab — port of `Component/Trip/TripInsightSection.swift`. A segmented
 * Personal/Group toggle drives two "remaining + spend" tiles on a gray container, a scope note,
 * and the non-zero category-spend list; Group additionally lists every member's share via
 * `MemberExpenseBreakdown`. Pro-gating happens one level up, in the trip detail screen — this
 * component assumes the caller already confirmed access.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { BudgetDto, ExpenseSummaryDto, TripBreakdownDto } from '@/features/trip/types';
import { useAppLanguage } from '@/i18n';
import { type Currency, moneyNumericValue } from '@/lib/currency';
import { NumericText, SegmentedToggle } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { CategorySpendRow } from './CategorySpendRow';
import { MemberExpenseBreakdown } from './MemberExpenseBreakdown';
import type { CategorySpend, InsightScope } from '../helpers/insightModel';
import { groupInsight, personalInsight } from '../helpers/insightModel';

export interface TripInsightSectionProps {
  breakdown: TripBreakdownDto | undefined;
  expenses: ExpenseSummaryDto[];
  budgets: BudgetDto[];
  currency: Currency;
  currentUserId: number | undefined;
  /** Trip's primary local currency code (`trip.localCurrencies[0]`), if any. */
  localCurrencyCode?: string | null;
}

const GRAY_CONTAINER = '#EBEBEB'; // rgb(235, 235, 235) — TripInsightSection.swift:116

export function TripInsightSection({
  breakdown,
  expenses,
  budgets,
  currency,
  currentUserId,
  localCurrencyCode,
}: TripInsightSectionProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const [scope, setScope] = useState<InsightScope>('personal');

  return (
    <View style={styles.root} testID="trip-insight-section">
      <SegmentedToggle
        options={[
          { value: 'personal', label: t('Personal') },
          { value: 'group', label: t('Group') },
        ]}
        value={scope}
        onChange={setScope}
        variant="segmented"
        testID="insight-scope"
      />

      {scope === 'personal' ? (
        <PersonalScope
          breakdown={breakdown}
          expenses={expenses}
          currency={currency}
          currentUserId={currentUserId}
        />
      ) : (
        <GroupScope
          breakdown={breakdown}
          expenses={expenses}
          budgets={budgets}
          currency={currency}
          currentUserId={currentUserId}
          localCurrencyCode={localCurrencyCode}
        />
      )}
    </View>
  );
}

function PersonalScope({
  breakdown,
  expenses,
  currency,
  currentUserId,
}: {
  breakdown: TripBreakdownDto | undefined;
  expenses: ExpenseSummaryDto[];
  currency: Currency;
  currentUserId: number | undefined;
}) {
  const { t } = useTranslation();
  useAppLanguage();
  const isLoading = !breakdown;
  const personal = breakdown ? personalInsight(breakdown, expenses, currentUserId ?? -1) : null;
  const myExpenses = personal?.myExpenses ?? 0;
  const remaining = personal?.remaining ?? 0;
  const isOver = personal?.isOver ?? false;
  const categories = personal?.categories ?? [];

  const note = isOver
    ? t(
        'Your current spending has exceeded your contributed budget. Please prepare to return the excess amount to the team.',
      )
    : t(
        'The two figures above are based on the actual spending of the members, and the figures may vary among members.',
      );

  return (
    <View style={styles.container}>
      <View style={styles.tiles}>
        <AmountTile
          title={t('Remaining')}
          amount={remaining}
          currency={currency}
          color={isOver ? colors.secondary : colors.contentB}
          isLoading={isLoading}
          testID="insight-personal-remaining"
        />
        <AmountTile
          title={t('Your expenses')}
          amount={myExpenses}
          currency={currency}
          color={colors.blueBase}
          isLoading={isLoading}
          testID="insight-personal-my-expenses"
        />
      </View>
      <Text style={styles.note}>{note}</Text>
      <CategoryList categories={categories} currency={currency} />
    </View>
  );
}

function GroupScope({
  breakdown,
  expenses,
  budgets,
  currency,
  currentUserId,
  localCurrencyCode,
}: {
  breakdown: TripBreakdownDto | undefined;
  expenses: ExpenseSummaryDto[];
  budgets: BudgetDto[];
  currency: Currency;
  currentUserId: number | undefined;
  localCurrencyCode: string | null | undefined;
}) {
  const { t } = useTranslation();
  useAppLanguage();
  // Group tiles can be rendered from `expenses` alone, so only show skeletons
  // while we have neither source of truth: once any expense has loaded the
  // numbers are meaningful even if `breakdown` is still in flight.
  const isLoading = !breakdown && expenses.length === 0;
  const group = groupInsight(breakdown, budgets, expenses);
  const isOver = group.remaining < 0;

  const note = isOver
    ? t('Your group spending has exceeded the shared budget. Review expenses, and add new budget.')
    : t(
        'Your group is still within the shared budget. Track total spending, remaining balance, and daily safe spend to keep the trip financially on pace.',
      );

  return (
    <>
      <View style={styles.container}>
        <View style={styles.tiles}>
          <AmountTile
            title={t('Remaining')}
            amount={group.remaining}
            currency={currency}
            color={isOver ? colors.secondary : colors.contentB}
            isLoading={isLoading}
            testID="insight-group-remaining"
          />
          <AmountTile
            title={t('Total expenses')}
            amount={group.totalSpent}
            currency={currency}
            color={colors.blueBase}
            isLoading={isLoading}
            testID="insight-group-total-expenses"
          />
        </View>
        <Text style={styles.note}>{note}</Text>
        <CategoryList categories={group.categories} currency={currency} />
      </View>

      <View style={styles.members}>
        <Text style={styles.membersTitle}>{t('Member expenses')}</Text>
        {(breakdown?.members ?? []).map((member) => (
          <MemberExpenseBreakdown
            key={member.userId}
            member={member}
            isCurrentUser={currentUserId != null && member.userId === currentUserId}
            homeCurrency={currency}
            localCurrencyCode={localCurrencyCode}
          />
        ))}
      </View>
    </>
  );
}

function CategoryList({
  categories,
  currency,
}: {
  categories: CategorySpend[];
  currency: Currency;
}) {
  return (
    <View style={styles.categoryList}>
      {categories.map((spend) => (
        <CategorySpendRow key={spend.category} spend={spend} currency={currency} />
      ))}
    </View>
  );
}

function AmountTile({
  title,
  amount,
  currency,
  color,
  isLoading,
  testID,
}: {
  title: string;
  amount: number;
  currency: Currency;
  color: string;
  isLoading: boolean;
  testID: string;
}) {
  return (
    <View style={styles.tile} testID={testID}>
      <Text style={styles.tileTitle}>{title}</Text>
      <NumericText
        value={moneyNumericValue(amount, currency)}
        minimumFractionDigits={currency.decimalPlaces}
        maximumFractionDigits={currency.decimalPlaces}
        suffix={` ${currency.symbol}`}
        style={[styles.tileValue, { color }, isLoading && styles.tileValueLoading]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  container: {
    padding: spacing.xs,
    backgroundColor: GRAY_CONTAINER,
    borderRadius: 18,
    gap: spacing.xs,
  },
  // iOS `HStack(alignment: .top)` — each tile hugs its own content height.
  tiles: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  tile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  tileTitle: { ...beVietnamPro(16), color: colors.contentB },
  tileValue: { ...beVietnamPro(24, 'medium') },
  tileValueLoading: { opacity: 0.4 },
  note: {
    ...beVietnamPro(14),
    color: colors.neutral700,
    paddingHorizontal: spacing.sm,
    paddingTop: 5,
    paddingBottom: spacing.sm + 2,
  },
  categoryList: { gap: spacing.sm, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  members: { gap: spacing.sm, paddingHorizontal: spacing.sm, paddingTop: spacing.md },
  membersTitle: { ...beVietnamPro(16), color: colors.contentB },
});
