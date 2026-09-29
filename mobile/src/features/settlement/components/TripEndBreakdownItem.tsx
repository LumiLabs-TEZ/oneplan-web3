/**
 * One pairwise settlement row — port of `Component/Trip/TripEndBreakdownItem.swift`.
 * Collapsed it shows "Receive from / Transfer to <name>" + the total; tapping the header
 * expands the per-expense shares and the settle action, which opens `TripEndConfirmSheet`.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { directionLabel, itemAmountText } from '@/features/settlement/helpers/settlementModel';
import { useAppLanguage } from '@/i18n';
import type { Currency } from '@/lib/currency';
import { Avatar, AvatarStack, type AvatarStackMember, Button, MoneyText } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import type { CounterpartySettlementDto } from '../api/queries';
import { TripEndConfirmSheet, type TripEndConfirmSheetRef } from './TripEndConfirmSheet';

export interface TripEndBreakdownItemProps {
  settlement: CounterpartySettlementDto;
  currency: Currency;
  /** Other members' avatars — drives the Group row's stack. */
  members: readonly AvatarStackMember[];
  settling?: boolean;
  onSettle: () => void;
}

const TONE_COLOR = { green: colors.green500, orange: colors.warning500 } as const;

export function TripEndBreakdownItem({
  settlement,
  currency,
  members,
  settling = false,
  onSettle,
}: TripEndBreakdownItemProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const confirmRef = useRef<TripEndConfirmSheetRef>(null);

  const isReceive = settlement.direction === 'receive';
  const { isSettled } = settlement;

  const handleConfirm = () => {
    confirmRef.current?.dismiss();
    setExpanded(false);
    onSettle();
  };

  return (
    <View style={styles.card} testID={`settlement-row-${settlement.counterpartyUserId}`}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setExpanded((v) => !v)}
        style={styles.header}
        testID="settlement-row-header"
      >
        {settlement.isGroup ? (
          <AvatarStack members={members} size={22.28} step={17.7} style={styles.stack} />
        ) : (
          <Avatar uri={settlement.avatarUrl} size={52} />
        )}

        <View style={styles.headerText}>
          <Text style={styles.direction} numberOfLines={1}>
            {directionLabel(settlement.direction, expanded, t)}
          </Text>
          <Text style={styles.name} numberOfLines={1}>
            {settlement.displayName}
          </Text>
        </View>

        <View style={styles.headerAmount}>
          <MoneyText
            amount={settlement.totalAmount}
            currency={currency}
            style={styles.amountStrong}
            symbolStyle={styles.amountSymbol}
            decimalColor={colors.contentL}
          />
          {isSettled ? <Text style={styles.settled}>{t('Success')}</Text> : null}
        </View>

        <View style={[styles.chevron, isSettled && styles.chevronDone]}>
          <Ionicons
            name={isSettled ? 'checkmark' : expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={isSettled ? colors.white : colors.contentL}
          />
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.expanded} testID="settlement-row-expanded">
          {settlement.items.map((item, index) => {
            const amount = itemAmountText(item, currency.symbol);
            return (
              <View
                key={item.shareId}
                style={[styles.itemRow, index > 0 && styles.itemDivider]}
                testID="settlement-item"
              >
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.expenseName}
                </Text>
                <MoneyText
                  amount={amount.amount}
                  currency={currency}
                  showDecimals={false}
                  symbolPosition="suffix"
                  sign={amount.sign}
                  style={[styles.itemAmount, { color: TONE_COLOR[amount.tone] }]}
                />
              </View>
            );
          })}

          {isSettled ? null : (
            <Button
              variant="primary"
              title={isReceive ? t('Mark as done') : t('Sent')}
              loading={settling}
              onPress={() => confirmRef.current?.present()}
              style={[styles.action, isReceive && styles.actionDark]}
              testID="settlement-row-action"
            />
          )}
        </View>
      ) : null}

      <TripEndConfirmSheet
        ref={confirmRef}
        amount={settlement.totalAmount}
        currency={currency}
        isReceiving={isReceive}
        confirming={settling}
        onConfirm={handleConfirm}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    shadowColor: '#000',
    shadowOpacity: 0.09,
    shadowRadius: 17.9,
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
  stack: { width: 52 },
  headerText: { flex: 1, gap: 2 },
  direction: { ...beVietnamPro(14), color: colors.neutral700 },
  name: { ...beVietnamPro(16, 'medium'), color: colors.contentB },
  headerAmount: { alignItems: 'flex-end', gap: 2 },
  // The symbol keeps the old row's 3pt gap; the cents are drawn inside the number itself.
  amountSymbol: { color: colors.contentL, marginRight: 3 },
  amountStrong: { ...beVietnamPro(18), color: colors.contentB },
  settled: { ...beVietnamPro(14), color: colors.contentM },
  chevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.onSurface,
  },
  chevronDone: { backgroundColor: colors.blueBase },
  expanded: { paddingHorizontal: spacing.xs },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  itemDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.dividerStroke },
  itemName: { ...beVietnamPro(16), color: colors.contentB, flex: 1, letterSpacing: -0.32 },
  itemAmount: { ...beVietnamPro(16), letterSpacing: -0.32 },
  action: { marginTop: spacing.sm },
  /** iOS `SecondaryButton(variant: .dark)` — #363636 fill, white label. */
  actionDark: { backgroundColor: colors.black },
});
