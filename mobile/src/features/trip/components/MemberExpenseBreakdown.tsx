/**
 * One row per group member in the "Member expenses" list — port of
 * `Component/Trip/MemberExpenseBreakdown.swift`. Only the current user's row expands to its
 * itemized share history; everyone else's row is a static summary. The optional converted line
 * shows the member's `totalShare` in the trip's primary local currency when it differs from
 * `homeCurrency` (`useConvertedAmount`, `MemberExpenseBreakdown.swift:161-195`).
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useConvertedAmount } from '@/features/exchange/useExchangeRate';
import { useAppLanguage } from '@/i18n';
import { type Currency, fallbackCurrency, moneyNumericValue } from '@/lib/currency';
import { Avatar, MoneyText, NumericText } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import type { MemberBreakdownDto } from '../types';

const AVATAR_SIZE = 52;
const CHEVRON_SIZE = 32;

export interface MemberExpenseBreakdownProps {
  member: MemberBreakdownDto;
  isCurrentUser: boolean;
  homeCurrency: Currency;
  /** Trip's primary local currency code (`trip.localCurrencies[0]`), if any. */
  localCurrencyCode?: string | null;
}

export function MemberExpenseBreakdown({
  member,
  isCurrentUser,
  homeCurrency,
  localCurrencyCode,
}: MemberExpenseBreakdownProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const isExpandable = isCurrentUser && member.expenses.length > 0;
  const convertTo =
    localCurrencyCode && localCurrencyCode !== homeCurrency.code ? localCurrencyCode : undefined;
  const converted = useConvertedAmount(member.totalShare, homeCurrency.code, convertTo);
  const convertedDecimals = convertTo ? fallbackCurrency(convertTo).decimalPlaces : 0;

  return (
    <View style={styles.card} testID={`member-expense-breakdown-${member.userId}`}>
      <View style={styles.headerRow}>
        <Avatar uri={member.avatarUrl} size={AVATAR_SIZE} />
        <Text style={styles.name} numberOfLines={1}>
          {isCurrentUser ? t('You') : member.displayName}
        </Text>
        <View style={styles.amountBlock}>
          <MoneyText
            amount={member.totalShare}
            currency={homeCurrency}
            style={styles.whole}
            symbolStyle={styles.symbol}
            decimalColor={colors.contentL}
          />
          {convertTo && converted.amount != null ? (
            // The converted caption shows the currency code, not a symbol — matches
            // `MemberExpenseBreakdown.swift:191-195` (`cur.rawValue`).
            <NumericText
              value={moneyNumericValue(converted.amount, fallbackCurrency(convertTo))}
              minimumFractionDigits={convertedDecimals}
              maximumFractionDigits={convertedDecimals}
              prefix="~"
              suffix={` ${convertTo}`}
              style={styles.converted}
            />
          ) : null}
        </View>
        {isExpandable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Expand')}
            accessibilityState={{ expanded }}
            onPress={() => setExpanded((e) => !e)}
            hitSlop={8}
            testID={`member-expense-breakdown-${member.userId}-toggle`}
            style={styles.chevron}
          >
            <Text style={[styles.chevronGlyph, expanded && styles.chevronGlyphOpen]}>{'▾'}</Text>
          </Pressable>
        ) : null}
      </View>

      {isExpandable && expanded ? (
        <View
          style={styles.historyList}
          testID={`member-expense-breakdown-${member.userId}-history`}
        >
          {member.expenses.map((share) => (
            <View key={share.shareId} style={styles.historyRow}>
              <Text style={styles.historyName} numberOfLines={1}>
                {share.expenseName || t('Expense')}
              </Text>
              <MoneyText
                amount={share.shareAmount}
                currency={homeCurrency}
                symbolPosition="suffix"
                style={styles.historyAmount}
                animated={false}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...beVietnamPro(16, 'medium'), color: colors.contentB, flexShrink: 1 },
  amountBlock: { flex: 1, alignItems: 'flex-end', gap: 2 },
  // The symbol keeps the 3pt gap the iOS HStack put before the whole part.
  symbol: { color: colors.contentL, marginRight: 3 },
  whole: { ...beVietnamPro(18), color: colors.contentB },
  converted: { ...beVietnamPro(14), color: colors.contentL },
  chevron: {
    width: CHEVRON_SIZE,
    height: CHEVRON_SIZE,
    borderRadius: CHEVRON_SIZE / 2,
    backgroundColor: colors.neutral100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronGlyph: { fontSize: 14, color: colors.contentB },
  chevronGlyphOpen: { transform: [{ rotate: '180deg' }] },
  historyList: { gap: 2, paddingHorizontal: spacing.xs },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 14 },
  historyName: { ...beVietnamPro(14), letterSpacing: -0.7, color: colors.contentB, flex: 1 },
  historyAmount: { ...beVietnamPro(16), letterSpacing: -0.32, color: colors.contentB },
});
