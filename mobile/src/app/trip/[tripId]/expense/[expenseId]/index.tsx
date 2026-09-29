/**
 * Expense detail — port of `ios/OnePlan/OnePlan/View/Expense/ExpenseDetailView.swift`.
 * Back-only header; the hero (name, amount + original-currency caption, % of budget pill) floats
 * in the free space above a bottom block of Edit / Delete actions (hidden when the trip is
 * read-only), the history card (time, category, your share, split scope, payer) and the shared
 * Prev/Next strip driven by the `ids` param (falls back to the trip's expense order).
 */
import type { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { classifyQueryError, useExpenseDetail } from '@/features/trip/api/queries';
import { expenseErrorMessage, useDeleteExpense } from '@/features/expense/api/mutations';
import { categoryChip } from '@/features/expense/categoryChip';
import { CategoryChipIcon } from '@/features/expense/components';
import {
  buildExpenseDetailModel,
  formatExpenseTime,
} from '@/features/expense/helpers/expenseDetailModel';
import { neighborIds } from '@/features/expense/helpers/neighbors';
import { useMe } from '@/features/me/useMe';
import { PrevNextStrip } from '@/features/plan/components';
import { useTripBudgets, useTripCore, useTripExpenses } from '@/features/trip/TripDetailContext';
import { deviceUses24hourClock, displayLocale, useAppLanguage } from '@/i18n';
import { moneyNumericValue } from '@/lib/currency';
import { Avatar, EmptyState, MoneyText, NumericText, SFSymbol, Spinner } from '@/ui/components';
import { BackButton } from '@/ui/components/BackButton';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const DELETE_RED = '#FF5959';
const DELETE_BG = '#FCE8E8';

function parseIds(raw: string | undefined): number[] | null {
  if (!raw) return null;
  const ids = raw
    .split(',')
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
  return ids.length > 0 ? ids : null;
}

export default function ExpenseDetailScreen() {
  const lang = useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tripId: string; expenseId: string; ids?: string }>();
  const expenseId = Number(params.expenseId);
  const detail = useTripCore();
  const { tripId, access, homeCurrency } = detail;
  const budgets = useTripBudgets();
  const { expenses } = useTripExpenses();
  const me = useMe();
  const query = useExpenseDetail(tripId, expenseId);
  const remove = useDeleteExpense(tripId);

  const ids = parseIds(params.ids) ?? expenses.map((e) => e.id);
  const { prev, next } = neighborIds(ids, expenseId);

  const goTo = (id: number) =>
    router.replace({
      pathname: '/trip/[tripId]/expense/[expenseId]',
      params: {
        tripId: String(tripId),
        expenseId: String(id),
        ...(params.ids ? { ids: params.ids } : {}),
      },
    });

  const onEdit = () =>
    router.push({
      pathname: '/trip/[tripId]/expense/[expenseId]/edit',
      params: { tripId: String(tripId), expenseId: String(expenseId) },
    });

  const onDelete = () => {
    if (remove.isPending) return;
    Alert.alert(
      t('Delete expense?'),
      t('This expense will be permanently removed from the trip.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await remove.mutateAsync(expenseId);
              router.back();
            } catch (e) {
              Alert.alert(
                t('Delete failed'),
                expenseErrorMessage(e, t('Failed to delete expense.')),
              );
            }
          },
        },
      ],
    );
  };

  const expense = query.data;
  const acceptedCount = detail.members.filter((m) => m.inviteStatus === 'ACCEPTED').length;
  const model = expense
    ? buildExpenseDetailModel({
        expense,
        homeCurrency,
        budgets,
        memberCount: acceptedCount,
        meId: me.data?.id,
      })
    : null;
  const category = categoryChip(expense?.category);

  let body: React.ReactNode;
  if (query.isPending) {
    body = <Spinner fill />;
  } else if (query.isError || !expense || !model) {
    body = (
      <EmptyState
        title={t('Failed to load expense details')}
        body={query.error ? classifyQueryError(query.error).message : undefined}
        action={{ label: t('Retry'), onPress: () => void query.refetch() }}
        style={styles.fill}
      />
    );
  } else {
    body = (
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 8 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* iOS `VStack { Spacer; hero; Spacer; … }`: hero centred in the free space. */}
        <View style={styles.spacer} />
        <View style={styles.hero}>
          <Text style={styles.heroName}>{expense.name}</Text>
          <View style={styles.heroAmountRow}>
            {/* Symbol stays a sibling: iOS draws it muted and 3pt apart, before the minus sign. */}
            <Text style={[styles.heroAmount, styles.heroMuted]}>{model.hero.symbol}</Text>
            <NumericText
              value={moneyNumericValue(model.hero.amount, model.hero.currency)}
              minimumFractionDigits={model.hero.currency.decimalPlaces}
              maximumFractionDigits={model.hero.currency.decimalPlaces}
              prefix="-"
              fractionColor={colors.contentL}
              minimumFontScale={0.5}
              containerStyle={styles.heroAmountFit}
              style={styles.heroAmount}
            />
          </View>
          {model.original ? (
            <NumericText
              value={moneyNumericValue(model.original.amount, model.original.currency)}
              minimumFractionDigits={model.original.currency.decimalPlaces}
              maximumFractionDigits={model.original.currency.decimalPlaces}
              prefix="~"
              suffix={` ${model.original.currency.code}`}
              style={styles.originalCaption}
            />
          ) : null}
          {model.budgetPercent != null ? (
            <View style={styles.progressPill} testID="budget-percent">
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${model.budgetPercent}%` }]} />
              </View>
              <NumericText value={model.budgetPercent} suffix="%" style={styles.progressText} />
            </View>
          ) : null}
        </View>
        <View style={styles.spacer} />

        <View style={styles.bottom}>
          {access.canEdit ? (
            <View style={styles.actions}>
              <ActionItem
                label={t('Edit')}
                symbol="pencil"
                fallback="pencil"
                iconColor={colors.contentB}
                background={colors.onSurface}
                onPress={onEdit}
              />
              <ActionItem
                testID="expense-delete"
                label={t('Delete')}
                symbol="trash"
                fallback="trash-outline"
                iconColor={DELETE_RED}
                background={DELETE_BG}
                disabled={remove.isPending}
                onPress={onDelete}
              />
            </View>
          ) : null}

          <View style={styles.card}>
            <Row title={t('Time')}>
              <Text style={styles.rowValue} numberOfLines={1}>
                {formatExpenseTime(
                  expense.expenseDate,
                  displayLocale(lang),
                  undefined,
                  deviceUses24hourClock(),
                )}
              </Text>
            </Row>
            <Divider />
            <Row title={t('Category')}>
              <View style={styles.rowInline}>
                <CategoryChipIcon category={expense.category} />
                <Text style={styles.rowValue} numberOfLines={1}>
                  {t(category.title)}
                </Text>
              </View>
            </Row>
            {model.myShareLabel ? (
              <>
                <Divider />
                <Row title={t('Your expense')}>
                  <MoneyText
                    amount={model.myShare ?? 0}
                    currency={model.hero.currency}
                    showDecimals={false}
                    symbolPosition="suffix"
                    sign="-"
                    style={[styles.rowValue, { color: DELETE_RED }]}
                  />
                </Row>
              </>
            ) : null}
            <Divider />
            <Row title={t('Share with')}>
              <View style={styles.rowInline}>
                <SFSymbol
                  name="person.3"
                  fallback="people-outline"
                  size={14}
                  frame={24}
                  color={colors.contentB}
                />
                <Text style={styles.rowValue} numberOfLines={1}>
                  {model.scope.type === 'all'
                    ? t('All')
                    : t('%lld members', { count: model.scope.count })}
                </Text>
              </View>
            </Row>
            <Divider />
            <Row title={t('Created by')}>
              <View style={styles.rowInline}>
                {model.payer.type === 'member' ? (
                  <Avatar uri={model.payer.avatarUrl} size={20} />
                ) : (
                  <SFSymbol
                    name="person"
                    fallback="person-outline"
                    size={14}
                    frame={18}
                    color={colors.contentB}
                  />
                )}
                <Text style={styles.rowValue} numberOfLines={1}>
                  {model.payer.type === 'member' ? model.payer.displayName : t('Group')}
                </Text>
              </View>
            </Row>
            {expense.note ? (
              <>
                <Divider />
                <View style={styles.noteBlock}>
                  <Text style={styles.rowTitle}>{t('Note')}</Text>
                  <Text style={styles.noteText}>{expense.note}</Text>
                </View>
              </>
            ) : null}
          </View>

          <PrevNextStrip
            prev={prev}
            next={next}
            onPrev={goTo}
            onNext={goTo}
            testIDPrefix="expense"
          />
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.root}>
      {/* Back only — iOS has no title or toolbar actions; Edit/Delete live in the action row. */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <BackButton />
      </View>
      {body}
    </View>
  );
}

function ActionItem({
  label,
  symbol,
  fallback,
  iconColor,
  background,
  disabled,
  onPress,
  testID,
}: {
  label: string;
  /** SF Symbol (iOS `Image(systemName:)`); `fallback` is the Ionicons glyph elsewhere. */
  symbol: string;
  fallback: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  background: string;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.actionItem, disabled && styles.disabled]}
    >
      <View style={[styles.actionCircle, { backgroundColor: background }]}>
        <SFSymbol name={symbol} fallback={fallback} size={16} frame={22} color={iconColor} />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.rowTrailing}>{children}</View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  content: { flexGrow: 1 },
  spacer: { flex: 1 },
  hero: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: spacing.lg, gap: 8 },
  heroName: { ...beVietnamPro(20, 'medium'), color: colors.contentB, textAlign: 'center' },
  heroAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: '100%' },
  heroAmount: { ...beVietnamPro(36), color: colors.contentB },
  heroMuted: { color: colors.contentL },
  heroAmountFit: { flexShrink: 1, minWidth: 0 },
  originalCaption: {
    ...beVietnamPro(14),
    color: colors.contentM,
    textAlign: 'center',
    paddingTop: 4,
  },
  progressPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.onSurface,
    borderRadius: 22,
    marginBottom: 32,
  },
  progressTrack: {
    width: 100,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.blueBase,
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: DELETE_RED },
  progressText: { ...beVietnamPro(14), color: colors.contentB },
  bottom: { gap: 10 },
  actions: { flexDirection: 'row', justifyContent: 'center', gap: 16 },
  actionItem: { alignItems: 'center', gap: 6, minWidth: 56 },
  actionCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { ...beVietnamPro(14), color: colors.contentB, letterSpacing: -0.6 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    overflow: 'hidden',
    marginHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 14,
    gap: spacing.sm,
  },
  rowTitle: { ...beVietnamPro(14), color: colors.contentM, letterSpacing: -0.7 },
  rowTrailing: { flex: 1, alignItems: 'flex-end' },
  rowInline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowValue: { ...beVietnamPro(16), color: colors.contentB },
  noteBlock: { paddingHorizontal: 10, paddingVertical: 14, gap: spacing.xs },
  noteText: { ...beVietnamPro(15), color: colors.contentB, lineHeight: 21 },
  divider: { height: 1, backgroundColor: colors.dividerStroke },
  disabled: { opacity: 0.35 },
});
