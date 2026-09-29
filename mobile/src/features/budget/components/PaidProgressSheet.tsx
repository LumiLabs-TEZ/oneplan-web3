/**
 * Per-budget payment toggle sheet for one member — port of `PaidProgressBottomSheet.swift`.
 * Read-only (opacity 0.65, taps disabled) when the viewer isn't the row owner or trip creator
 * (`WhoDepositView.canToggle`).
 */
import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { paidProgressSheetHeight } from '@/features/budget/helpers/deposits';
import { useAppLanguage } from '@/i18n';
import type { Currency } from '@/lib/currency';
import { AppSheet, type AppSheetRef, MoneyText } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface PaidProgressItem {
  id: string;
  budgetId: number;
  paymentId: number;
  title: string;
  /** Drawn as the whole amount + trailing symbol (`"1,000,000đ"`). */
  amount: number;
  currency: Currency;
  isPaid: boolean;
}

export interface PaidProgressSheetProps {
  items: readonly PaidProgressItem[];
  canToggle: boolean;
  onToggle: (item: PaidProgressItem) => void;
  onDismiss?: () => void;
}

export interface PaidProgressSheetRef {
  present: () => void;
  dismiss: () => void;
}

export const PaidProgressSheet = forwardRef<PaidProgressSheetRef, PaidProgressSheetProps>(
  function PaidProgressSheet({ items, canToggle, onToggle, onDismiss }, ref) {
    useAppLanguage();
    const { t } = useTranslation();
    const sheetRef = useRef<AppSheetRef>(null);

    useImperativeHandle(ref, () => ({
      present: () => sheetRef.current?.present(),
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const height = paidProgressSheetHeight(items.length);

    return (
      <AppSheet ref={sheetRef} snapPoints={[height]} onDismiss={onDismiss}>
        <View style={styles.container} testID="paid-progress-sheet">
          <View style={styles.toolbar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Close')}
              onPress={() => sheetRef.current?.dismiss()}
              style={styles.roundButton}
              testID="paid-progress-close"
            >
              <Ionicons name="close" size={18} color={colors.contentM} />
            </Pressable>
            <Text style={styles.title}>{t('Paid progress')}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Done')}
              onPress={() => sheetRef.current?.dismiss()}
              style={[styles.roundButton, styles.roundButtonPrimary]}
              testID="paid-progress-done"
            >
              <Ionicons name="checkmark" size={18} color={colors.white} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.list}>
              {items.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.isPaid, disabled: !canToggle }}
                  disabled={!canToggle}
                  onPress={() => onToggle(item)}
                  style={[styles.row, !canToggle && styles.readOnly]}
                  testID={`paid-progress-row-${item.id}`}
                >
                  <SelectionIndicator selected={item.isPaid} />
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <MoneyText
                    amount={item.amount}
                    currency={item.currency}
                    showDecimals={false}
                    symbolPosition="suffix"
                    style={styles.rowAmount}
                  />
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      </AppSheet>
    );
  },
);

function SelectionIndicator({ selected }: { selected: boolean }) {
  return (
    <View style={[styles.indicator, selected ? styles.indicatorPaid : styles.indicatorUnpaid]}>
      {selected ? <Ionicons name="checkmark" size={12} color={colors.white} /> : null}
    </View>
  );
}

const PAID_GREEN = 'rgb(51, 199, 89)';
const UNPAID_STROKE = 'rgb(199, 199, 204)';

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingBottom: 19, gap: 12 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
  },
  roundButton: {
    width: 43,
    height: 43,
    borderRadius: 21.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral100,
  },
  roundButtonPrimary: { backgroundColor: colors.blueBase },
  title: { ...beVietnamPro(18), color: colors.contentB },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 16,
    paddingRight: 12,
    paddingVertical: 24,
    borderRadius: 19,
    backgroundColor: colors.neutral50,
  },
  readOnly: { opacity: 0.65 },
  rowTitle: { ...beVietnamPro(16), color: colors.black, flex: 1 },
  rowAmount: { ...beVietnamPro(16), color: colors.black },
  indicator: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorPaid: { backgroundColor: PAID_GREEN },
  indicatorUnpaid: { borderWidth: 1.5, borderColor: UNPAID_STROKE },
});
