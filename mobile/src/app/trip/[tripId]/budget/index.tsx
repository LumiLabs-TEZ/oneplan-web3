/**
 * Who Deposit — port of `ios/OnePlan/OnePlan/View/Budget/WhoDepositView.swift`. Top section
 * lists the trip's budgets (reusing `buildHistorySections` filtered to budget entries) with an
 * "Edit" capsule per row; bottom "Progress" section lists each member's aggregated deposit
 * (`aggregateDeposits`) — tapping a row opens the per-budget `PaidProgressSheet`, whose toggle
 * calls `useMarkPayment` directly (no separate "save" step; the sheet's check button just closes).
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMarkPayment } from '@/features/budget/api/mutations';
import {
  PaidProgressSheet,
  type PaidProgressItem,
  type PaidProgressSheetRef,
  WhoDepositRow,
} from '@/features/budget/components';
import { aggregateDeposits, canTogglePayment } from '@/features/budget/helpers/deposits';
import { useMe } from '@/features/me/useMe';
import { buildHistorySections } from '@/features/trip/helpers/historyEntries';
import { useTripBudgets, useTripCore } from '@/features/trip/TripDetailContext';
import { useAppLanguage } from '@/i18n';
import type { CurrencyCode } from '@/lib/currency';
import { EmptyState, MoneyText, Spinner } from '@/ui/components';
import { BackButton } from '@/ui/components/BackButton';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export default function BudgetDepositScreen() {
  const lang = useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const detail = useTripCore();
  const budgets = useTripBudgets();
  const me = useMe();
  const markPayment = useMarkPayment(detail.tripId);

  const sheetRef = useRef<PaidProgressSheetRef>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  const { members, trip, homeCurrency } = detail;

  const budgetSections = useMemo(
    () =>
      buildHistorySections({
        expenses: [],
        budgets,
        members: members.filter((m) => m.inviteStatus === 'ACCEPTED'),
        currency: homeCurrency.code as CurrencyCode,
        now: new Date(),
        t,
        locale: lang,
      }),
    [budgets, members, homeCurrency.code, t, lang],
  );

  const deposits = useMemo(() => aggregateDeposits(budgets), [budgets]);

  const currentUserId = me.data?.id ?? null;
  const canToggleSelected = canTogglePayment(
    currentUserId,
    selectedUserId ?? -1,
    trip?.createdById,
  );

  const items: PaidProgressItem[] = useMemo(() => {
    if (selectedUserId == null) return [];
    return budgets
      .map((budget) => {
        const payment = budget.payments.find((p) => p.userId === selectedUserId);
        if (!payment) return null;
        return {
          id: `${budget.id}:${payment.id}`,
          budgetId: budget.id,
          paymentId: payment.id,
          title: budget.name,
          amount: payment.amount,
          currency: homeCurrency,
          isPaid: payment.isPaid,
        } satisfies PaidProgressItem;
      })
      .filter((item): item is PaidProgressItem => item != null);
  }, [budgets, homeCurrency, selectedUserId]);

  const openMember = (userId: number) => {
    setSelectedUserId(userId);
    sheetRef.current?.present();
  };

  const onToggle = (item: PaidProgressItem) => {
    markPayment.mutate({
      budgetId: item.budgetId,
      paymentId: item.paymentId,
      isPaid: !item.isPaid,
    });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <BackButton testID="budget-list-back" />
        <Text style={styles.title} numberOfLines={1}>
          {t('Who Deposit')}
        </Text>
        <View style={styles.headerButton} />
      </View>

      {detail.isLoading ? (
        <Spinner fill />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {budgetSections.length > 0 ? (
            <View style={styles.historyGroups}>
              {budgetSections.map((section) => (
                <View key={section.dateKey} style={styles.historyGroup}>
                  <Text style={styles.historyLabel}>{section.label}</Text>
                  <View style={styles.historyCard}>
                    {section.entries.map((entry, index) => (
                      <View key={`${entry.kind}:${entry.id}`}>
                        <View style={styles.historyRow}>
                          <View style={styles.historyIcon}>
                            <Ionicons name="card" size={16} color={colors.green500} />
                          </View>
                          <Text style={styles.historyTitle} numberOfLines={1}>
                            {entry.name}
                          </Text>
                          <MoneyText
                            amount={entry.amount}
                            currency={entry.amountCurrency}
                            showDecimals={false}
                            symbolPosition="suffix"
                            sign={entry.amountSign}
                            style={styles.historyAmount}
                            animated={false}
                          />
                          <Pressable
                            accessibilityRole="button"
                            onPress={() =>
                              router.push({
                                pathname: '/trip/[tripId]/budget/[budgetId]/edit',
                                params: {
                                  tripId: String(detail.tripId),
                                  budgetId: String(entry.id),
                                },
                              })
                            }
                            style={styles.editCapsule}
                            testID={`budget-history-edit-${entry.id}`}
                          >
                            <Text style={styles.editCapsuleText}>{t('Edit')}</Text>
                          </Pressable>
                        </View>
                        {index < section.entries.length - 1 ? (
                          <View style={styles.historyDivider} />
                        ) : null}
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.progressSection}>
            <Text style={styles.progressTitle}>{t('Progress')}</Text>
            {deposits.length === 0 ? (
              <EmptyState title={t('No history')} />
            ) : (
              deposits.map((row) => (
                <WhoDepositRow
                  key={row.userId}
                  row={row}
                  currency={homeCurrency}
                  totalBudgetCount={budgets.length}
                  onPress={() => openMember(row.userId)}
                />
              ))
            )}
          </View>
        </ScrollView>
      )}

      <PaidProgressSheet
        ref={sheetRef}
        items={items}
        canToggle={canToggleSelected}
        onToggle={onToggle}
        onDismiss={() => setSelectedUserId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { ...beVietnamPro(17, 'semibold'), color: colors.contentB, flex: 1, textAlign: 'center' },
  content: { paddingHorizontal: spacing.sm, paddingBottom: 32, gap: 12 },
  historyGroups: { gap: 12 },
  historyGroup: { gap: 8 },
  historyLabel: { ...beVietnamPro(14), letterSpacing: -0.42, color: colors.contentM },
  historyCard: { backgroundColor: colors.surface, borderRadius: 24, overflow: 'hidden' },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 14,
  },
  historyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.green100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyTitle: { ...beVietnamPro(15), color: colors.contentB, flex: 1 },
  historyAmount: { ...beVietnamPro(16), color: colors.green500 },
  historyDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.neutral100 },
  editCapsule: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.black,
  },
  editCapsuleText: { ...beVietnamPro(14), color: colors.white },
  progressSection: { gap: 8, paddingHorizontal: spacing.xs },
  progressTitle: { ...beVietnamPro(16, 'medium'), color: colors.contentM },
});
