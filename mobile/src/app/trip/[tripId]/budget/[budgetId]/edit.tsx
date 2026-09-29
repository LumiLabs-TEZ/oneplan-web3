/**
 * Edit budget — port of `ios/OnePlan/OnePlan/View/Budget/EditBudgetView.swift`.
 * Seeds a draft from the trip's `BudgetDto` list (`seedEditBudget`), edits amount/currency, name
 * and contributors, and PATCHes only the dirty fields (`buildUpdateBudgetBody`) so the server
 * keeps the stored conversion and payment rows for untouched fields. No category/date editing
 * here (budgets have neither in this screen).
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mutationErrorMessage } from '@/api/mutationError';
import { useDeleteBudget, useUpdateBudget } from '@/features/budget/api/mutations';
import { ContributorChips } from '@/features/budget/components';
import { EditAmountField } from '@/features/expense/components';
import {
  buildUpdateBudgetBody,
  type EditBudgetDraft,
  seedEditBudget,
} from '@/features/budget/editBudgetDiff';
import { displayCurrencies } from '@/features/trip/helpers/tripCurrencyRules';
import { useTripBudgets, useTripCore } from '@/features/trip/TripDetailContext';
import type { BudgetDto } from '@/features/trip/types';
import { useAppLanguage } from '@/i18n';
import { type Currency, currencyFromCode, parse } from '@/lib/currency';
import {
  Avatar,
  BackPillButton,
  Button,
  EmptyState,
  GlassIconButton,
  SFSymbol,
} from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export default function EditBudgetScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tripId: string; budgetId: string }>();
  const budgetId = Number(params.budgetId);
  const { trip } = useTripCore();
  const budgets = useTripBudgets();
  const budget = budgets.find((b) => b.id === budgetId);

  if (!trip || !budget) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
        <EmptyState
          title={t('Failed to load budget details')}
          action={{ label: t('Back'), onPress: () => router.back() }}
          style={styles.fill}
        />
      </View>
    );
  }
  // Keyed so a different budget re-seeds the baseline; a refetch of the same id does not.
  return <EditBudgetForm key={budget.id} budget={budget} />;
}

function amountFrom(draft: EditBudgetDraft): number {
  return parse(draft.amountText, draft.currency.decimalPlaces);
}

function EditBudgetForm({ budget }: { budget: BudgetDto }) {
  useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const { tripId, trip, members, homeCurrency } = useTripCore();
  const update = useUpdateBudget(tripId, budget.id);
  const del = useDeleteBudget(tripId);

  const accepted = members.filter((m) => m.inviteStatus === 'ACCEPTED');
  const acceptedIds = accepted.map((m) => m.userId);

  const [seed] = useState(() => seedEditBudget(budget, trip!, acceptedIds));
  const [draft, setDraft] = useState<EditBudgetDraft>(seed);

  const locals = (trip?.localCurrencies ?? [])
    .map((c) => currencyFromCode(c))
    .filter((c): c is Currency => Boolean(c));
  const base = displayCurrencies(homeCurrency, locals);
  const currencies = base.some((c) => c.code === seed.baseline.currency.code)
    ? base
    : [...base, seed.baseline.currency];

  const creator = members.find((m) => m.userId === trip?.createdById);

  const contributorCount =
    draft.contributors === 'all' ? acceptedIds.length : draft.contributors.ids.length;
  const currentAmount = amountFrom(draft);
  const valid = draft.name.trim().length > 0 && currentAmount > 0 && contributorCount > 0;

  const onSave = async () => {
    Keyboard.dismiss();
    if (!(currentAmount > 0)) {
      Alert.alert(t('Error'), t('Budget amount must be greater than 0.'));
      return;
    }
    if (contributorCount === 0) {
      Alert.alert(t('Error'), t('Budget must have at least one contributor.'));
      return;
    }
    const body = buildUpdateBudgetBody(seed, draft, trip!);
    if (!body) {
      router.back();
      return;
    }
    try {
      await update.mutateAsync(body);
      router.back();
    } catch (e) {
      Alert.alert(t('Error'), mutationErrorMessage(e, t('Failed to update budget')));
    }
  };

  const onDelete = () => {
    Alert.alert(
      t('Delete budget?'),
      t('This permanently removes "%@" and all its contribution records. This cannot be undone.', {
        0: budget.name,
      }),
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await del.mutateAsync(budget.id);
              router.back();
            } catch (e) {
              Alert.alert(t('Error'), mutationErrorMessage(e, t('Failed to delete budget')));
            }
          },
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top + 8 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <BackPillButton onPress={() => router.back()} />
        <GlassIconButton label={t('Delete')} onPress={onDelete} testID="edit-budget-delete">
          <SFSymbol
            name="trash"
            fallback="trash-outline"
            size={17}
            frame={20}
            color={colors.warning500}
          />
        </GlassIconButton>
      </View>

      {/* Same layout as Edit expense: amount ~12% down, a flexible gap, details low, Done last. */}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ height: Math.max(40, screenHeight * 0.12) }} />

        <EditAmountField
          value={draft.amountText}
          onChangeText={(text) => setDraft((d) => ({ ...d, amountText: text }))}
          currency={draft.currency}
          currencies={currencies}
          onCurrencyChange={(currency) => setDraft((d) => ({ ...d, currency }))}
          caption={t('Per person')}
          testID="edit-budget-amount"
        />

        <View style={styles.flexGap} />

        <View style={styles.details}>
          <TextInput
            value={draft.name}
            onChangeText={(name) => setDraft((d) => ({ ...d, name }))}
            placeholder={t('Budget name')}
            placeholderTextColor={colors.contentL}
            maxLength={255}
            returnKeyType="done"
            style={styles.nameInput}
            testID="edit-budget-name"
          />

          <ContributorChips
            members={accepted}
            contributors={draft.contributors}
            onChange={(contributors) => setDraft((d) => ({ ...d, contributors }))}
            testIDPrefix="edit-contributor-chip"
          />

          <View style={styles.createdByRow}>
            <Text style={styles.createdByLabel}>{t('Created by')}</Text>
            <View style={styles.createdByValue}>
              <Avatar uri={creator?.avatarUrl} size={22} />
              <Text style={styles.createdByName} numberOfLines={1}>
                {creator?.displayName ?? t('Unknown')}
              </Text>
            </View>
          </View>
        </View>

        {/* Live whenever the draft is valid, like Edit expense — an unchanged draft just pops. */}
        <Button
          variant="primary"
          title={t('Done')}
          onPress={() => void onSave()}
          disabled={!valid}
          loading={update.isPending}
          style={styles.done}
          testID="edit-budget-save"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  content: { flexGrow: 1 },
  flexGap: { flexGrow: 1, minHeight: 32 },
  details: { paddingHorizontal: 16, gap: 16 },
  done: { marginTop: 16, marginHorizontal: 24 },
  nameInput: {
    height: 59,
    paddingHorizontal: spacing.xl,
    borderRadius: 20,
    backgroundColor: colors.surface,
    ...beVietnamPro(16),
    letterSpacing: -0.32,
    color: colors.contentB,
  },
  createdByRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    height: 56,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
  },
  createdByLabel: { ...beVietnamPro(16), color: colors.contentM },
  createdByValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  createdByName: { ...beVietnamPro(16), color: colors.contentB },
});
