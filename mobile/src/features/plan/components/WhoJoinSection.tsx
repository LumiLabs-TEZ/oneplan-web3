/**
 * "Who join" member picker — port of `PlanFormView.whoJoinSection`
 * (`ios/OnePlan/OnePlan/View/Plan/PlanFormView.swift:342-387`). Reuses `MemberPickerChip`
 * (blue accent, matching the "Share with" row) plus an aggregate "All" chip.
 */
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, type StyleProp, Text, View, type ViewStyle } from 'react-native';

import type { components } from '@/api/schema';
import { MemberPickerChip } from '@/features/expense/components/MemberPickerChip';
import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import type { PlanFormMembers } from '../planForm';

type TripMemberDto = components['schemas']['TripMemberDto'];

export interface WhoJoinSectionProps {
  acceptedMembers: readonly TripMemberDto[];
  members: PlanFormMembers;
  onToggleMember: (id: number) => void;
  onSelectAll: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Stands in for the `%@` so the translated sentence can be split around the styled run. */
const RUN = '\u0000';

export function WhoJoinSection({
  acceptedMembers,
  members,
  onToggleMember,
  onSelectAll,
  style,
}: WhoJoinSectionProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const whoJoin = t('Who join');

  return (
    <View style={[styles.root, style]}>
      <Text style={styles.label}>{whoJoin}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.row}>
          <MemberPickerChip
            label={t('All')}
            selected={members.all}
            accent="blue"
            onPress={onSelectAll}
            testID="plan-who-join-all"
          />
          {acceptedMembers.map((member) => (
            <MemberPickerChip
              key={member.userId}
              member={member}
              selected={!members.all && members.ids.includes(member.userId)}
              accent="blue"
              onPress={() => onToggleMember(member.userId)}
              testID={`plan-who-join-${member.userId}`}
            />
          ))}
        </View>
      </ScrollView>

      {/* One sentence for translators; the quoted "Who join" run is drawn darker, like iOS. */}
      <Text style={styles.blurb}>
        {t('Members selected in "%@" section will receive notifications as the plan approaches.', {
          0: RUN,
        })
          .split(RUN)
          .map((part, index) => (
            <Text key={index}>
              {index > 0 ? <Text style={styles.blurbEmphasis}>{whoJoin}</Text> : null}
              {part}
            </Text>
          ))}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8, paddingBottom: 10 },
  label: { ...beVietnamPro(14), color: colors.contentM, paddingHorizontal: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingTop: 4 },
  blurb: { ...beVietnamPro(14), color: colors.contentM, paddingHorizontal: 6 },
  blurbEmphasis: { color: colors.contentB },
});
