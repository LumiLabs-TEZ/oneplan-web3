/**
 * Port of `VaultTransactionEditView.swift` (`origin/feat/web3-version`, Figma `4575:14996`) —
 * edits a confirmed vault spend's name/category/share. Amount is read-only: the on-chain
 * transfer already happened, so there is no amount field in the PATCH body at all.
 */
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { components } from '@/api/schema';
import { mutationErrorMessage } from '@/api/mutationError';
import {
  ExpenseCategoryPickerSheet,
  MemberPickerChip,
  useExpenseCategoryPicker,
} from '@/features/expense/components';
import { categoryOption, type ExpenseCategory } from '@/features/expense/categories';
import { useAppLanguage } from '@/i18n';
import { CurrencyFormatter } from '@/lib/currency';
import { Button, SFSymbol } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { useUpdateVaultSpend, type VaultTransactionDetailDto } from '../api/mutations';
import { CategoryIcon } from '../components/CategoryIcon';
import { VaultHeaderChip } from '../components/VaultHeaderChip';
import { resolvedShareWithUserIds, resolvedSpendName } from './editSpendLogic';

type TripMemberDto = components['schemas']['TripMemberDto'];

export interface VaultTransactionEditScreenProps {
  tripId: number;
  vaultTransactionId: number;
  amountVnd: number;
  /** VND per USDC — read-only `$x.xx` line under the amount. */
  rate?: number;
  members: readonly TripMemberDto[];
  initialName: string;
  initialCategory: ExpenseCategory;
  /** Empty means shared with everyone. */
  initialShareWithUserIds: readonly number[];
  onBack: () => void;
  onSaved: (updated: VaultTransactionDetailDto, savedName: string) => void;
}

export function VaultTransactionEditScreen({
  tripId,
  vaultTransactionId,
  amountVnd,
  rate = 0,
  members,
  initialName,
  initialCategory,
  initialShareWithUserIds,
  onBack,
  onSaved,
}: VaultTransactionEditScreenProps) {
  useAppLanguage();
  const { t } = useTranslation();

  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState<ExpenseCategory>(initialCategory);
  const [isSharedWithAll, setIsSharedWithAll] = useState(initialShareWithUserIds.length === 0);
  const [shareWithUserIds, setShareWithUserIds] = useState<Set<number>>(
    () => new Set(initialShareWithUserIds),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const categoryPicker = useExpenseCategoryPicker();
  const updateSpend = useUpdateVaultSpend(tripId, vaultTransactionId);

  const acceptedMembers = members.filter((m) => m.inviteStatus === 'ACCEPTED');
  const usdcText = rate > 0 ? `$${(amountVnd / rate).toFixed(2)}` : '';

  function toggleShare(userId: number) {
    const next = new Set(shareWithUserIds);
    if (next.has(userId)) next.delete(userId);
    else next.add(userId);
    setShareWithUserIds(next);
    setIsSharedWithAll(next.size === 0);
  }

  async function save() {
    setErrorMessage(null);
    const savedName = resolvedSpendName(name, categoryOption(category).title);
    try {
      const updated = await updateSpend.mutateAsync({
        name: savedName,
        category,
        shareWithUserIds: resolvedShareWithUserIds(isSharedWithAll, shareWithUserIds),
      });
      onSaved(updated, savedName);
    } catch (err) {
      setErrorMessage(mutationErrorMessage(err, t('Could not save')));
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t('Back')}>
          <VaultHeaderChip>
            <View style={styles.backIcon}>
              <SFSymbol
                name="arrow.left"
                fallback="arrow-back"
                size={14}
                frame={32}
                weight="500"
                color={colors.neutral900}
              />
            </View>
          </VaultHeaderChip>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.amountBlock}>
          <View style={styles.vndChip}>
            <Text style={styles.vndChipText}>VND</Text>
          </View>
          <Text style={styles.amount} numberOfLines={1}>
            {CurrencyFormatter.formatWhole(amountVnd)}
          </Text>
          {usdcText ? <Text style={styles.usdcHint}>{usdcText}</Text> : null}
        </View>

        <View style={styles.categoryAndName}>
          <Pressable
            /**
             * `categoryPicker.open` is a stable callback (`() => ref.current?.present()`) that
             * only reads `.current` when invoked by the press, never during render — the same
             * `useExpenseCategoryPicker()` pattern already shipped in
             * `AddExpenseDetailsSheet.tsx`'s `onPickCategory={picker.open}`.
             */
            // eslint-disable-next-line react-hooks/refs
            onPress={categoryPicker.open}
            style={styles.categoryButton}
            accessibilityRole="button"
            accessibilityLabel={t('Category, %@', { 0: t(categoryOption(category).title) })}
          >
            <CategoryIcon category={category} size={43} />
            <Ionicons name="chevron-down" size={10} color={colors.contentM} />
          </Pressable>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('Transaction name')}
            style={styles.nameInput}
          />
        </View>

        <View style={styles.shareSection}>
          <Text style={styles.shareLabel}>{t('Share with')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              <MemberPickerChip
                label={t('All')}
                accent="blue"
                selected={isSharedWithAll}
                onPress={() => {
                  setIsSharedWithAll(true);
                  setShareWithUserIds(new Set());
                }}
                testID="vault-edit-share-all"
              />
              {acceptedMembers.map((member) => (
                <MemberPickerChip
                  key={member.userId}
                  member={member}
                  accent="blue"
                  selected={!isSharedWithAll && shareWithUserIds.has(member.userId)}
                  onPress={() => toggleShare(member.userId)}
                  testID={`vault-edit-share-${member.userId}`}
                />
              ))}
            </View>
          </ScrollView>
        </View>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      </ScrollView>

      <Button
        title={t('Done')}
        onPress={save}
        loading={updateSpend.isPending}
        disabled={updateSpend.isPending}
        style={styles.doneButton}
        testID="vault-edit-done"
      />

      <ExpenseCategoryPickerSheet
        /**
         * Forwards the ref *object* itself (never reads `.current`) — the same legal pattern as
         * `AddExpenseDetailsSheet.tsx`'s `ref={picker.ref}`.
         */
        // eslint-disable-next-line react-hooks/refs
        ref={categoryPicker.ref}
        value={category}
        onSelect={setCategory}
        nested
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8 },
  backIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 12, paddingBottom: 24 },
  amountBlock: { alignItems: 'center', gap: 16, paddingTop: 48, paddingBottom: 28 },
  vndChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: colors.onSurface,
  },
  vndChipText: { ...beVietnamPro(16), letterSpacing: -0.32, color: colors.neutral900 },
  amount: { ...beVietnamPro(48), letterSpacing: -2.4, color: colors.neutral950 },
  usdcHint: { ...beVietnamPro(14), letterSpacing: -0.56, color: colors.neutral600 },
  categoryAndName: { flexDirection: 'row', gap: 8, paddingBottom: 16 },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 12,
    paddingRight: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.white,
  },
  nameInput: {
    flex: 1,
    minHeight: 59,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: colors.white,
    ...beVietnamPro(16),
    letterSpacing: -0.32,
    color: colors.contentB,
  },
  shareSection: { gap: 10 },
  shareLabel: { ...beVietnamPro(16, 'medium'), letterSpacing: -0.32, color: colors.neutral600 },
  chipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 4 },
  error: { ...beVietnamPro(14), color: colors.secondary, paddingTop: 12 },
  doneButton: { marginHorizontal: 24, marginBottom: 24 },
});
