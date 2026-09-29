/**
 * Category list sheet for a vault payment — port of
 * `ios/OnePlan/OnePlan/View/Vault/CategoryPickerSheet.swift` (`feat/web3-version`, large detent).
 * Presented from `VaultExpenseSheet` and, in Wave C, `VaultTransactionEditView`.
 *
 * Lists `EXPENSE_CATEGORIES` (`@/features/expense/categories`) — same source of truth as the
 * classic expense flow's `ExpenseCategoryPickerSheet` — so this can never drift from what the API
 * accepts: a category the server adds shows up here automatically, matching Swift's
 * `CategoryChip.Category.allCases` guarantee.
 */
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { EXPENSE_CATEGORIES, type ExpenseCategory } from '@/features/expense/categories';
import { useAppLanguage } from '@/i18n';
import { AppSheet, type AppSheetRef } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { CategoryIcon } from './CategoryIcon';

export interface CategoryPickerSheetProps {
  value: ExpenseCategory;
  /** Called before the sheet dismisses itself. */
  onSelect: (category: ExpenseCategory) => void;
  onDismiss?: () => void;
}

export type CategoryPickerSheetRef = AppSheetRef;

export const CategoryPickerSheet = forwardRef<CategoryPickerSheetRef, CategoryPickerSheetProps>(
  function CategoryPickerSheet({ value, onSelect, onDismiss }, ref) {
    useAppLanguage();
    const { t } = useTranslation();
    const sheetRef = useRef<AppSheetRef>(null);
    useImperativeHandle(ref, () => sheetRef.current as AppSheetRef, []);

    return (
      // Always nested (presented from `VaultExpenseSheet`): `preset` pushes it over the parent.
      <AppSheet ref={sheetRef} preset="nestedList" onDismiss={onDismiss}>
        <View style={styles.container} testID="vault-category-picker-sheet">
          <Text style={styles.title}>{t('Categories')}</Text>
          <BottomSheetScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.list}
          >
            {EXPENSE_CATEGORIES.map((option) => {
              const selected = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    onSelect(option.value);
                    sheetRef.current?.dismiss();
                  }}
                  testID={`vault-category-option-${option.value}`}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <CategoryIcon category={option.value} size={43} />
                  <Text style={styles.rowTitle} numberOfLines={1} ellipsizeMode="tail">
                    {t(option.title)}
                  </Text>
                  {selected ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.blueBase} />
                  ) : null}
                </Pressable>
              );
            })}
          </BottomSheetScrollView>
        </View>
      </AppSheet>
    );
  },
);

/** Convenience ref + open/close pair for callers that present the picker. */
export function useCategoryPicker() {
  const ref = useRef<CategoryPickerSheetRef>(null);
  return {
    ref,
    open: () => ref.current?.present(),
    close: () => ref.current?.dismiss(),
  };
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.lg },
  title: {
    ...beVietnamPro(20),
    letterSpacing: -0.4,
    color: colors.contentB,
    textAlign: 'center',
  },
  list: { gap: spacing.sm, paddingBottom: spacing.xxxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  rowTitle: { ...beVietnamPro(16), letterSpacing: -0.32, color: colors.contentB, flex: 1 },
  pressed: { opacity: 0.7 },
});
