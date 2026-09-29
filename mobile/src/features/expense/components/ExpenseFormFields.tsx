/**
 * Presentational body of the add/edit expense form — port of `CategoryNameFieldRow` +
 * `paidBySection` / `shareWithSection` in
 * `ios/OnePlan/OnePlan/View/Expense/AddExpenseDetailsSheet.swift`. State lives in the caller
 * (`detailsFormReducer`) so the same fields serve the details sheet and the Edit screen.
 */
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { components } from '@/api/schema';
import { categoryOption } from '@/features/expense/categories';
import {
  type DetailsFormAction,
  type DetailsFormState,
  isMemberSelected,
} from '@/features/expense/detailsFormReducer';
import { useAppLanguage } from '@/i18n';
import { SFSymbol } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { MemberPickerChip } from './MemberPickerChip';

type TripMemberDto = components['schemas']['TripMemberDto'];

export interface ExpenseFormFieldsProps {
  state: DetailsFormState;
  dispatch: (action: DetailsFormAction) => void;
  members: readonly TripMemberDto[];
  onPickCategory: () => void;
  /** Hide the category + name row (default `true`). */
  showName?: boolean;
  /**
   * Fills behind the category button / name field (`CategoryNameFieldRow.fieldFill` /
   * `nameFieldFill`). Defaults suit the white detail sheets; screens on the grey app background
   * pass `colors.surface` so the fields read as white cards.
   */
  fieldFill?: string;
  nameFieldFill?: string;
}

export function ExpenseFormFields({
  state,
  dispatch,
  members,
  onPickCategory,
  showName = true,
  fieldFill = colors.neutral50,
  nameFieldFill = colors.background,
}: ExpenseFormFieldsProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const accepted = members.filter((m) => m.inviteStatus === 'ACCEPTED');
  const category = categoryOption(state.category);
  const CategoryIcon = category.Icon;

  return (
    <View style={styles.root}>
      {showName ? (
        <View style={styles.nameRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Category')}
            accessibilityValue={{ text: t(category.title) }}
            onPress={onPickCategory}
            testID="category-row"
            style={({ pressed }) => [
              styles.categoryButton,
              { backgroundColor: fieldFill },
              pressed && styles.pressed,
            ]}
          >
            <CategoryIcon width={43} height={43} />
            <SFSymbol
              name="chevron.down"
              fallback="chevron-down"
              size={11}
              frame={14}
              weight="600"
              color={colors.neutral950}
            />
          </Pressable>
          <TextInput
            value={state.name}
            onChangeText={(name) => dispatch({ type: 'setName', name })}
            placeholder={t('Transaction name')}
            placeholderTextColor={colors.contentL}
            maxLength={255}
            returnKeyType="done"
            style={[styles.nameInput, { backgroundColor: nameFieldFill }]}
            testID="expense-name-input"
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionLabel} numberOfLines={1}>
          {t('Paid by')}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            <MemberPickerChip
              label={t('Group')}
              accent="orange"
              selected={state.paidBy.type === 'group'}
              onPress={() => dispatch({ type: 'setPaidBy', paidBy: { type: 'group' } })}
              testID="payer-chip-group"
            />
            {accepted.map((member) => (
              <MemberPickerChip
                key={member.userId}
                member={member}
                accent="orange"
                selected={state.paidBy.type === 'member' && state.paidBy.userId === member.userId}
                onPress={() =>
                  dispatch({
                    type: 'setPaidBy',
                    paidBy: { type: 'member', userId: member.userId },
                  })
                }
                testID={`payer-chip-${member.userId}`}
              />
            ))}
          </View>
        </ScrollView>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel} numberOfLines={1}>
          {t('Share with')}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            <MemberPickerChip
              label={t('All')}
              accent="blue"
              selected={state.shareMode.type === 'all'}
              onPress={() => dispatch({ type: 'selectAll' })}
              testID="share-chip-all"
            />
            {accepted.map((member) => (
              <MemberPickerChip
                key={member.userId}
                member={member}
                accent="blue"
                selected={isMemberSelected(state.shareMode, member.userId)}
                onPress={() => dispatch({ type: 'toggleMember', userId: member.userId })}
                testID={`share-chip-${member.userId}`}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 12,
    paddingRight: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  nameInput: {
    flex: 1,
    height: 59,
    paddingHorizontal: spacing.xl,
    borderRadius: 20,
    ...beVietnamPro(16),
    letterSpacing: -0.32,
    color: colors.contentB,
  },
  section: { gap: 10 },
  sectionLabel: { ...beVietnamPro(16, 'medium'), letterSpacing: -0.32, color: colors.neutral600 },
  chipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 1 },
  pressed: { opacity: 0.7 },
});
