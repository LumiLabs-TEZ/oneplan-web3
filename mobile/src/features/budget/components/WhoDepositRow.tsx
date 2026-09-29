/**
 * One member's deposit summary — port of the private `WhoDepositRow` in `WhoDepositView.swift`.
 * Tap opens the `PaidProgressSheet` for this member's per-budget payment rows.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { DepositRow } from '@/features/budget/helpers/deposits';
import { useAppLanguage } from '@/i18n';
import type { Currency } from '@/lib/currency';
import { Avatar, MoneyText } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { DepositProgressBar } from './DepositProgressBar';

export interface WhoDepositRowProps {
  row: DepositRow;
  /** Trip currency — its symbol trails the whole amount (`+1,000,000đ`). */
  currency: Currency;
  /** Denominator for "x/y paid" — total budget count for the trip, not this member's segments. */
  totalBudgetCount: number;
  onPress: () => void;
}

const AVATAR_SIZE = 48;

export function WhoDepositRow({ row, currency, totalBudgetCount, onPress }: WhoDepositRowProps) {
  useAppLanguage();
  const { t } = useTranslation();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={`deposit-row-${row.userId}`}
    >
      <Avatar uri={row.avatarUrl} size={AVATAR_SIZE} />
      <View style={styles.main}>
        <Text style={styles.name} numberOfLines={1}>
          {row.displayName}
        </Text>
        <DepositProgressBar segments={row.segments} />
      </View>
      <View style={styles.trailing}>
        <MoneyText
          amount={row.paidAmount}
          currency={currency}
          showDecimals={false}
          symbolPosition="suffix"
          sign="+"
          style={styles.amount}
        />
        <Text style={styles.paid} numberOfLines={1}>
          {t('%lld/%lld paid', { 0: row.paidCount, 1: totalBudgetCount })}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  pressed: { opacity: 0.7 },
  main: { width: 200, gap: 5 },
  name: { ...beVietnamPro(16), letterSpacing: -0.7, color: colors.contentB },
  trailing: { marginLeft: 'auto', alignItems: 'flex-end', gap: 3 },
  amount: { ...beVietnamPro(16), letterSpacing: -0.7, color: colors.green500 },
  paid: { ...beVietnamPro(14), letterSpacing: -0.6, color: colors.contentM },
});
