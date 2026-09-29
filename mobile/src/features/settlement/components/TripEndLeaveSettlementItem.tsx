/**
 * The leaving member's own settlement card — port of `View/Trip/TripEnd/TripEndLeaveSettlementItem.swift`.
 * Expanded by default; `Mark as Done` opens the confirm sheet whose confirm only navigates home
 * (the member was already removed by `LeaveTripSheet`, so there is nothing left to settle server-side).
 */
import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { leaveTotals } from '@/features/settlement/helpers/settlementModel';
import { useAppLanguage } from '@/i18n';
import { type Currency, formatWhole } from '@/lib/currency';
import { Avatar, Button, MoneyText } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import type { LeaveSettlementDto } from '../types';
import { TripEndConfirmSheet, type TripEndConfirmSheetRef } from './TripEndConfirmSheet';

const RECEIVE_BG = 'rgb(242, 250, 247)';
const PAY_BG = 'rgb(250, 242, 242)';
const RECEIVE_TILE = 'rgb(209, 242, 227)';
const PAY_TILE = 'rgb(242, 209, 209)';

export interface TripEndLeaveSettlementItemProps {
  settlement: LeaveSettlementDto;
  avatarUrl?: string | null;
  currency: Currency;
  onMarkAsDone: () => void;
}

export function TripEndLeaveSettlementItem({
  settlement,
  avatarUrl,
  currency,
  onMarkAsDone,
}: TripEndLeaveSettlementItemProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const confirmRef = useRef<TripEndConfirmSheetRef>(null);

  const { totalShare, isAllSettled } = leaveTotals(settlement);
  const net = settlement.netSettlement;
  const isReceiving = net > 0;

  const netLabel = isAllSettled
    ? { text: t('All Settled'), color: colors.contentM }
    : net > 0
      ? { text: t('+%@ (to receive)', { 0: formatWhole(net) }), color: colors.green500 }
      : net < 0
        ? { text: t('-%@ (to send)', { 0: formatWhole(Math.abs(net)) }), color: colors.secondary }
        : { text: t('All Settled'), color: colors.contentM };

  return (
    <View style={styles.card} testID="leave-settlement-item">
      <View style={styles.header}>
        <Avatar uri={avatarUrl} size={52} />
        <Text style={styles.name} numberOfLines={1}>
          {settlement.displayName}
        </Text>
        <View style={styles.headerAmount}>
          <MoneyText
            amount={totalShare}
            currency={currency}
            style={styles.amountStrong}
            symbolStyle={styles.amountSymbol}
            decimalColor={colors.contentL}
          />
          <Text style={[styles.netLabel, { color: netLabel.color }]} testID="leave-net-label">
            {netLabel.text}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Breakdown')}
          onPress={() => setExpanded((v) => !v)}
          style={[styles.chevron, expanded && styles.chevronOpen]}
          testID="leave-settlement-toggle"
        >
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-forward'}
            size={14}
            color={expanded ? colors.blueBase : colors.contentL}
          />
        </Pressable>
      </View>

      {expanded ? (
        <View style={styles.body} testID="leave-settlement-body">
          {settlement.totalBudgetRefund > 0 ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>{t('Total Paid Budget')}</Text>
              <MoneyText
                amount={settlement.totalBudgetRefund}
                currency={currency}
                showDecimals={false}
                symbolPosition="suffix"
                sign="+"
                style={[styles.rowAmount, { color: colors.green500 }]}
              />
            </View>
          ) : null}

          {settlement.expenses.map((expense, index) => (
            <View
              key={`${expense.expenseName}-${index}`}
              style={styles.row}
              testID="leave-expense-row"
            >
              <Text style={styles.rowLabel} numberOfLines={1}>
                {expense.expenseName}
              </Text>
              <MoneyText
                amount={expense.shareAmount}
                currency={currency}
                showDecimals={false}
                symbolPosition="suffix"
                sign="-"
                style={[
                  styles.rowAmount,
                  { color: expense.isSettled ? colors.contentM : colors.secondary },
                ]}
              />
            </View>
          ))}

          {net !== 0 ? (
            <View
              style={[styles.netRow, { backgroundColor: isReceiving ? RECEIVE_BG : PAY_BG }]}
              testID="leave-net-row"
            >
              <View style={styles.netIcon}>
                <Ionicons name="people" size={16} color={colors.blueBase} />
              </View>
              <View style={styles.netText}>
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {isReceiving ? t('Receive from group') : t('Pay to group')}
                </Text>
                <MoneyText
                  amount={Math.abs(net)}
                  currency={currency}
                  sign={isReceiving ? '+' : '-'}
                  style={styles.netAmountStrong}
                  symbolStyle={styles.netAmountSymbol}
                  decimalColor={colors.contentL}
                />
              </View>
              <View
                style={[styles.netTile, { backgroundColor: isReceiving ? RECEIVE_TILE : PAY_TILE }]}
              >
                <Ionicons
                  name={isReceiving ? 'download-outline' : 'push-outline'}
                  size={18}
                  color={colors.surface}
                />
              </View>
            </View>
          ) : null}

          {isAllSettled ? null : (
            <Button
              variant="primary"
              title={t('Mark as Done')}
              onPress={() => confirmRef.current?.present()}
              style={styles.action}
              testID="leave-settlement-action"
            />
          )}
        </View>
      ) : null}

      <TripEndConfirmSheet
        ref={confirmRef}
        amount={Math.abs(net)}
        currency={currency}
        isReceiving={isReceiving}
        onConfirm={() => {
          confirmRef.current?.dismiss();
          onMarkAsDone();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8.95,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: spacing.sm,
    paddingBottom: 2,
  },
  name: { ...beVietnamPro(16, 'medium'), color: colors.contentB, flex: 1 },
  headerAmount: { alignItems: 'flex-end', gap: 2 },
  // The symbol keeps the old row's 3pt gap; the cents are drawn inside the number itself.
  amountSymbol: { color: colors.contentL, marginRight: 3 },
  amountStrong: { ...beVietnamPro(18), color: colors.contentB },
  netLabel: { ...beVietnamPro(14), textAlign: 'right' },
  chevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.onSurface,
  },
  chevronOpen: { backgroundColor: colors.blueAlpha16 },
  body: { gap: spacing.sm, paddingTop: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.xs,
    paddingVertical: 14,
    borderRadius: radius.xxl,
    backgroundColor: colors.surface,
  },
  rowLabel: { ...beVietnamPro(14), color: colors.contentB, flex: 1 },
  rowAmount: { ...beVietnamPro(14), textAlign: 'right' },
  netRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    minHeight: 63,
    borderRadius: radius.lg,
  },
  netIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blueAlpha16,
  },
  netText: { flex: 1, gap: 3 },
  netAmountSymbol: { ...beVietnamPro(16), color: colors.contentL, marginRight: 3 },
  netAmountStrong: { ...beVietnamPro(16, 'medium'), color: colors.contentB },
  netTile: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: { marginTop: spacing.xs },
});
