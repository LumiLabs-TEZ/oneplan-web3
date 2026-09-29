import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { CountryBadge } from '@/features/passport/helpers/flags';
import type { PassportSummaryDto } from '@/features/passport/types';
import { useAppLanguage } from '@/i18n';
import { NumericText } from '@/ui/components/NumericText';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface PassportStatsBlockProps {
  summary: PassportSummaryDto | null;
  countryBadges: CountryBadge[];
  /** compact variant: only the trips + flags row. */
  topRowOnly?: boolean;
  /** Figma compact spec scales the stat block to ~0.86x (`compact` variant). */
  compact?: boolean;
  testID?: string;
}

/** iOS uses `setLocalizedDateFormatFromTemplate("dd MMM yy")` — the month name follows locale. */
function memberSinceLocale(language: string): string {
  return language === 'vi' ? 'vi-VN' : 'en-US';
}

function memberSinceValue(summary: PassportSummaryDto | null, language: string): string {
  if (!summary) return '12 Mar 26';
  const date = new Date(summary.memberSince);
  if (Number.isNaN(date.getTime())) return '12 Mar 26';
  const formatter = new Intl.DateTimeFormat(memberSinceLocale(language), {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const day = parts.find((p) => p.type === 'day')?.value ?? '12';
  const month = parts.find((p) => p.type === 'month')?.value ?? 'Mar';
  const year = parts.find((p) => p.type === 'year')?.value ?? '26';
  return `${day} ${month} ${year}`;
}

/** Port of `PassportCard.swift`'s private `PassportStatsBlock`. */
export function PassportStatsBlock({
  summary,
  countryBadges,
  topRowOnly = false,
  compact = false,
  testID,
}: PassportStatsBlockProps) {
  const language = useAppLanguage();
  const { t } = useTranslation();

  // The placeholder sample values (24 trips / "03" countries) render through the same number view.
  const tripsValue = summary ? Math.max(Math.trunc(summary.tripsCount), 0) : 24;
  const countriesValue = summary ? Math.max(Math.trunc(summary.countriesCount), 0) : 3;
  const badgeSize = compact ? 19 : 22;

  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.topRow}>
        <View style={styles.tripsColumn}>
          <Text style={[styles.label, compact ? styles.labelCompact : null, styles.labelSecondary]}>
            {t('Total trips')}
          </Text>
          <NumericText
            value={tripsValue}
            useGrouping={false}
            style={[styles.tripsValue, compact ? styles.tripsValueCompact : null]}
          />
        </View>

        <View style={styles.badges}>
          {countryBadges.map((badge, index) => (
            <View
              key={index}
              style={[
                styles.badge,
                {
                  width: badgeSize,
                  height: badgeSize,
                  borderRadius: badgeSize / 2,
                  backgroundColor: badge.background,
                  marginLeft: index === 0 ? 0 : compact ? -5 : -6,
                },
              ]}
            >
              <Text style={{ fontSize: badgeSize * 0.55 }}>{badge.flag}</Text>
            </View>
          ))}
        </View>
      </View>

      {!topRowOnly ? (
        <View style={styles.bottomRow}>
          <View style={styles.tripsColumn}>
            <Text style={[styles.label, styles.labelTertiary]}>{t('Member since')}</Text>
            <Text style={styles.subValue}>{memberSinceValue(summary, language)}</Text>
          </View>
          <View style={styles.countriesColumn}>
            <Text style={[styles.label, styles.labelTertiary]}>{t('Country visited')}</Text>
            <NumericText
              value={countriesValue}
              minimumIntegerDigits={2}
              useGrouping={false}
              style={styles.subValue}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tripsColumn: { flex: 1, gap: 4 },
  countriesColumn: { width: 109, gap: 4 },
  label: { ...beVietnamPro(15, 'regular'), letterSpacing: -0.45 },
  labelCompact: { ...beVietnamPro(13, 'regular'), letterSpacing: -0.39 },
  labelSecondary: { color: colors.contentM },
  labelTertiary: { ...beVietnamPro(13, 'regular'), letterSpacing: -0.39, color: colors.contentL },
  tripsValue: { ...beVietnamPro(48, 'medium'), letterSpacing: -1.44, color: colors.black },
  tripsValueCompact: { ...beVietnamPro(41, 'medium'), letterSpacing: -1.24 },
  subValue: { ...beVietnamPro(24, 'medium'), color: colors.black },
  badges: { flexDirection: 'row', alignItems: 'center' },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(84, 84, 84, 0.4)',
  },
});
