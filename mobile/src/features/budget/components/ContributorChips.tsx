/**
 * "Who's contributing" chip row — shared by `AddBudgetDetailsSheet` and the edit-budget screen
 * so the toggle rule (`toggleContributor` / `selectAllContributors`) and layout have one
 * implementation. Port of the contributor section in
 * `ios/OnePlan/OnePlan/View/Budget/{AddBudgetDetailsSheet,EditBudgetView}.swift`.
 */
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { components } from '@/api/schema';
import { type BudgetContributors, toggleContributorIds } from '@/features/budget/budgetFormReducer';
import { MemberPickerChip } from '@/features/expense/components';
import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

type TripMemberDto = components['schemas']['TripMemberDto'];

export interface ContributorChipsProps {
  /** Already filtered to ACCEPTED members. */
  members: readonly TripMemberDto[];
  contributors: BudgetContributors;
  onChange: (contributors: BudgetContributors) => void;
  /** Prefix for row `testID`s — the add sheet and edit screen use different prefixes. */
  testIDPrefix?: string;
}

export function ContributorChips({
  members,
  contributors,
  onChange,
  testIDPrefix = 'contributor-chip',
}: ContributorChipsProps) {
  useAppLanguage();
  const { t } = useTranslation();

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel} numberOfLines={1}>
        {t("Who's contributing")}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          <MemberPickerChip
            label={t('All')}
            accent="blue"
            selected={contributors === 'all'}
            onPress={() => onChange('all')}
            testID={`${testIDPrefix}-all`}
          />
          {members.map((member) => (
            <MemberPickerChip
              key={member.userId}
              member={member}
              accent="blue"
              selected={contributors !== 'all' && contributors.ids.includes(member.userId)}
              onPress={() => onChange(toggleContributorIds(contributors, member.userId))}
              testID={`${testIDPrefix}-${member.userId}`}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  sectionLabel: { ...beVietnamPro(16, 'medium'), letterSpacing: -0.32, color: colors.neutral600 },
  chipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 1 },
});
