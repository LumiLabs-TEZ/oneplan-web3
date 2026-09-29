/**
 * Leave-trip settlement preview — port of `LeaveTripBottomSheet.swift`. Fetches the preview only
 * while presented (`useLeavePreview({ enabled })`), then on confirm removes the current user and
 * hands off to the M3.5 end-of-trip screen with the resulting settlement.
 */
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { mutationErrorMessage } from '@/api/mutationError';
import { useLeavePreview } from '@/features/trip/api/leave';
import { invalidateTripLists, useRemoveMember } from '@/features/trip/api/mutations';
import {
  leaveSheetHeight,
  netSettlementText,
  type NetSettlementTone,
} from '@/features/trip/helpers/leaveModel';
import { useAppLanguage } from '@/i18n';
import { type Currency } from '@/lib/currency';
import { markSelfLeave, unmarkSelfLeave } from '@/realtime/realtimeStore';
import {
  AppSheet,
  type AppSheetRef,
  Button,
  DismissButton,
  MoneyText,
  Spinner,
} from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface LeaveTripSheetProps {
  tripId: number;
  currentUserId: number | undefined;
  currency: Currency;
}

export interface LeaveTripSheetRef {
  present: () => void;
  dismiss: () => void;
}

const TONE_COLOR: Record<NetSettlementTone, string> = {
  green: colors.green500,
  red: colors.secondary,
  muted: colors.contentM,
};

export const LeaveTripSheet = forwardRef<LeaveTripSheetRef, LeaveTripSheetProps>(
  function LeaveTripSheet({ tripId, currentUserId, currency }, ref) {
    useAppLanguage();
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const sheetRef = useRef<AppSheetRef>(null);
    const [open, setOpen] = useState(false);
    const [leaving, setLeaving] = useState(false);

    const preview = useLeavePreview(tripId, { enabled: open });
    const removeMember = useRemoveMember(tripId);

    useImperativeHandle(ref, () => ({
      present: () => {
        setOpen(true);
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const dto = preview.data;
    const settlement = dto ? netSettlementText(dto.netSettlement, currency.symbol, t) : null;

    const handleConfirm = async () => {
      if (currentUserId == null || leaving) return;
      setLeaving(true);
      // The server echoes `tripMemberRemoved` back to the leaver; flag it so the trip screen's
      // web3 "removed → dismiss" handler doesn't navigate on top of the `replace` below.
      markSelfLeave(tripId);
      try {
        const result = await removeMember.mutateAsync(currentUserId);
        await invalidateTripLists(queryClient);
        sheetRef.current?.dismiss();
        router.replace({
          pathname: '/trip/[tripId]/end',
          params: { tripId: String(tripId), mode: 'leaving', settlement: JSON.stringify(result) },
        });
      } catch (err) {
        unmarkSelfLeave(tripId);
        Alert.alert(mutationErrorMessage(err, t('Failed to leave trip')));
      } finally {
        setLeaving(false);
      }
    };

    return (
      <AppSheet
        ref={sheetRef}
        snapPoints={[leaveSheetHeight(dto?.budgets.length ?? 0)]}
        onDismiss={() => setOpen(false)}
      >
        <View style={styles.container} testID="leave-trip-sheet">
          <View style={styles.header}>
            <Text style={styles.title}>{t('Leave Trip')}</Text>
            <DismissButton
              onPress={() => sheetRef.current?.dismiss()}
              accessibilityLabel={t('Close')}
            />
          </View>

          {preview.isPending ? (
            <Spinner fill />
          ) : dto ? (
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              {dto.budgets.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>{t('Budget Contributions')}</Text>
                  <View style={styles.rows}>
                    {dto.budgets.map((budget, index) => (
                      <View key={`${budget.budgetName}-${index}`} style={styles.row}>
                        <View style={styles.rowLeft}>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {budget.budgetName}
                          </Text>
                          <Text
                            style={[
                              styles.rowStatus,
                              { color: budget.isPaid ? colors.green500 : colors.contentM },
                            ]}
                          >
                            {budget.isPaid ? t('Paid') : t('Unpaid')}
                          </Text>
                        </View>
                        {budget.refundAmount > 0 ? (
                          <MoneyText
                            amount={budget.refundAmount}
                            currency={currency}
                            showDecimals={false}
                            symbolPosition="suffix"
                            sign="+"
                            style={[styles.rowAmount, { color: colors.green500 }]}
                          />
                        ) : (
                          <MoneyText
                            amount={budget.amount}
                            currency={currency}
                            showDecimals={false}
                            symbolPosition="suffix"
                            style={[styles.rowAmount, { color: colors.contentM }]}
                          />
                        )}
                      </View>
                    ))}
                  </View>
                  {dto.totalBudgetRefund > 0 ? (
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>{t('Total')}</Text>
                      <MoneyText
                        amount={dto.totalBudgetRefund}
                        currency={currency}
                        showDecimals={false}
                        symbolPosition="suffix"
                        sign="+"
                        style={[styles.totalLabel, { color: colors.green500 }]}
                      />
                    </View>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('Settlement Summary')}</Text>
                <View style={styles.rows}>
                  {dto.totalBudgetRefund > 0 ? (
                    <View style={styles.row}>
                      <Text style={styles.rowTitle}>{t('Budget contributed')}</Text>
                      <MoneyText
                        amount={dto.totalBudgetRefund}
                        currency={currency}
                        showDecimals={false}
                        symbolPosition="suffix"
                        sign="+"
                        style={[styles.rowAmount, { color: colors.green500 }]}
                      />
                    </View>
                  ) : null}
                  <View style={styles.row}>
                    <Text style={styles.rowTitle}>{t('Your expense share')}</Text>
                    <MoneyText
                      amount={dto.totalExpenseShare}
                      currency={currency}
                      showDecimals={false}
                      symbolPosition="suffix"
                      sign="-"
                      style={[
                        styles.rowAmount,
                        { color: dto.totalExpenseShare > 0 ? colors.secondary : colors.contentM },
                      ]}
                    />
                  </View>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>{t('Net Settlement')}</Text>
                  {settlement ? (
                    <Text style={[styles.totalLabel, { color: TONE_COLOR[settlement.tone] }]}>
                      {settlement.text}
                    </Text>
                  ) : null}
                </View>
              </View>

              <Text style={styles.footnote}>
                {t("You will no longer have access to this trip's plans, expenses, and photos.")}
              </Text>
            </ScrollView>
          ) : null}

          <Button
            title={t('Confirm Leave')}
            loading={leaving}
            disabled={!dto || currentUserId == null}
            onPress={() => void handleConfirm()}
            style={styles.confirmButton}
            testID="leave-trip-confirm"
          />
        </View>
      </AppSheet>
    );
  },
);

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  title: { ...beVietnamPro(18, 'semibold'), color: colors.contentB },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  section: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.onSurface,
    gap: spacing.sm,
  },
  sectionTitle: { ...beVietnamPro(14, 'medium'), color: colors.contentB },
  rows: { gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  rowLeft: { gap: 2 },
  rowTitle: { ...beVietnamPro(14), color: colors.contentB },
  rowStatus: { ...beVietnamPro(12) },
  rowAmount: { ...beVietnamPro(14) },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
  totalLabel: { ...beVietnamPro(14, 'medium'), color: colors.contentB },
  footnote: { ...beVietnamPro(13), color: colors.contentM, paddingHorizontal: spacing.xs },
  confirmButton: { marginHorizontal: spacing.lg, backgroundColor: colors.secondary },
});
