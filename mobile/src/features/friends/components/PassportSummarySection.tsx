/**
 * Passport-style summary under the send-request badge — port of
 * `SendFriendRequestPassportSummarySection` (`SendFriendRequestView.swift:235-300`): three metric
 * cards (`%02d`), a divider, the six locked flag badges, and the MRZ lines.
 */
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { PassportMRZLines } from '@/features/passport/components';
import { useAppLanguage } from '@/i18n';
import { NumericText } from '@/ui/components/NumericText';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { FIXED_FLAG_BADGES, FlagBadge } from './FlagBadge';

/** `Color(red: 0.68, green: 0.68, blue: 0.68)`. */
const MRZ_COLOR = '#ADADAD';

export interface PassportSummarySectionProps {
  tripCount: number;
  countryCount: number;
  cityCount: number;
  displayName: string;
  memberSince: string | null;
  testID?: string;
}

/** `value` is a count drawn `%02d`; negatives clamp to 0. */
function MetricCard({ title, value }: { title: string; value: number }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <NumericText
        value={Math.max(value, 0)}
        minimumIntegerDigits={2}
        useGrouping={false}
        style={styles.cardValue}
      />
    </View>
  );
}

export function PassportSummarySection({
  tripCount,
  countryCount,
  cityCount,
  displayName,
  memberSince,
  testID,
}: PassportSummarySectionProps) {
  useAppLanguage();
  const { t } = useTranslation();

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.cards}>
        <MetricCard title={t('Trips')} value={tripCount} />
        <MetricCard title={t('Countries')} value={countryCount} />
        <MetricCard title={t('Cities')} value={cityCount} />
      </View>

      <View style={styles.divider} />

      <View style={styles.flags}>
        {FIXED_FLAG_BADGES.map(({ flag, color }, index) => (
          <FlagBadge
            key={flag}
            flag={flag}
            color={color}
            // iOS overlaps the badges by 6.136pt. Yoga ignores a negative `gap`, so the overlap
            // is a negative margin on every badge but the first (same as `MutualAvatarStrip`).
            style={index === 0 ? undefined : styles.overlap}
            testID={`friend-flag-${index}`}
          />
        ))}
      </View>

      <PassportMRZLines
        displayName={displayName}
        memberSince={memberSince}
        color={MRZ_COLOR}
        style={styles.mrz}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  cards: { flexDirection: 'row', gap: spacing.sm },
  card: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    backgroundColor: colors.white,
    borderRadius: radius.sm + 2,
  },
  cardTitle: { ...beVietnamPro(14), color: colors.contentM, letterSpacing: -0.6 },
  cardValue: { ...beVietnamPro(20), color: colors.contentB, letterSpacing: -1 },
  divider: { height: 1, backgroundColor: colors.neutral100, marginTop: 30 },
  flags: { flexDirection: 'row', alignSelf: 'center', paddingRight: 6.136, marginTop: 34 },
  overlap: { marginLeft: -6.136 },
  mrz: { marginTop: 0 },
});
