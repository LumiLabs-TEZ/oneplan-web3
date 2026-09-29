/**
 * Category list sheet — port of `ios/OnePlan/OnePlan/View/Expense/ExpenseCategoryPickerSheet.swift`
 * (large detent). Presented from the details sheet and the Edit screen.
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

export interface ExpenseCategoryPickerSheetProps {
  value: ExpenseCategory;
  /** Called before the sheet dismisses itself. */
  onSelect: (category: ExpenseCategory) => void;
  onDismiss?: () => void;
  /**
   * Set when the picker opens from inside another sheet (the vault transaction editor), so it
   * pushes over its parent rather than minimising it. The classic expense flow leaves this off.
   */
  nested?: boolean;
}

export type ExpenseCategoryPickerSheetRef = AppSheetRef;

export const ExpenseCategoryPickerSheet = forwardRef<
  ExpenseCategoryPickerSheetRef,
  ExpenseCategoryPickerSheetProps
>(function ExpenseCategoryPickerSheet({ value, onSelect, onDismiss, nested = false }, ref) {
  useAppLanguage();
  const { t } = useTranslation();
  const sheetRef = useRef<AppSheetRef>(null);
  useImperativeHandle(ref, () => sheetRef.current as AppSheetRef, []);

  return (
    <AppSheet
      ref={sheetRef}
      snapPoints={['85%']}
      preset={nested ? 'nestedList' : undefined}
      onDismiss={onDismiss}
    >
      <View style={styles.container}>
        <Text style={styles.title}>{t('Categories')}</Text>
        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        >
          {EXPENSE_CATEGORIES.map((option) => {
            const selected = option.value === value;
            const Icon = option.Icon;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => {
                  onSelect(option.value);
                  sheetRef.current?.dismiss();
                }}
                testID={`category-option-${option.value}`}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <Icon width={32} height={32} />
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
});

/** Convenience ref + open/close pair for callers that present the picker. */
export function useExpenseCategoryPicker() {
  const ref = useRef<ExpenseCategoryPickerSheetRef>(null);
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
    letterSpacing: -0.8,
    color: colors.neutral950,
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
