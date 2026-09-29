import { StyleSheet, View } from 'react-native';

import { countryBadges as buildCountryBadges } from '@/features/passport/helpers/flags';
import type { PassportSummaryDto } from '@/features/passport/types';
import { colors } from '@/ui/theme';

import { DashedLine } from './DashedLine';
import { MarkerStrip } from './MarkerStrip';
import { PassportMRZLines } from './PassportMRZLines';
import { PassportShareRow, type PassportShareKind } from './PassportShareRow';
import { PassportStatsBlock } from './PassportStatsBlock';
import { PassportYearChips } from './PassportYearChips';

export type PassportCardVariant = 'full' | 'compact' | 'render';

export interface PassportCardProps {
  summary: PassportSummaryDto | null;
  variant: PassportCardVariant;
  years?: number[];
  selectedYear?: number | null;
  onSelectYear?: (year: number | null) => void;
  onShare?: (kind: PassportShareKind) => void;
  testID?: string;
}

const MRZ_COLOR = 'rgba(161, 161, 161, 1)';
const DIVIDER_COLOR = 'rgba(212, 212, 212, 1)';

/**
 * Port of `Component/Common/PassportCard.swift`.
 * - `full`: year chips + animated marker strip + MRZ + stats + MRZ + share row.
 * - `compact`: MRZ + top-row-only stats (0.86x scale) — no chips/strip/share.
 * - `render`: same layout as `full` minus the chips/share row, with a static marker strip and a
 *   fixed 360pt width, for off-screen `ImageRenderer`-style export.
 */
export function PassportCard({
  summary,
  variant,
  years = [],
  selectedYear = null,
  onSelectYear,
  onShare,
  testID,
}: PassportCardProps) {
  const displayName = summary?.displayName ?? '';
  const memberSince = summary?.memberSince ?? null;
  const badges = buildCountryBadges(summary?.topCountries ?? null);

  if (variant === 'compact') {
    return (
      <View style={[styles.card, styles.cardCompact]} testID={testID}>
        <PassportMRZLines displayName={displayName} memberSince={memberSince} color={MRZ_COLOR} />
        <PassportStatsBlock summary={summary} countryBadges={badges} topRowOnly compact />
      </View>
    );
  }

  const isFull = variant === 'full';

  return (
    <View
      style={[styles.card, styles.cardFull, variant === 'render' && styles.cardRender]}
      testID={testID}
    >
      {isFull && onSelectYear ? (
        <PassportYearChips
          selectedYear={selectedYear}
          availableYears={years}
          onSelect={onSelectYear}
          testID={testID ? `${testID}-years` : undefined}
        />
      ) : null}

      <MarkerStrip variant={variant === 'render' ? 'static' : 'animated'} />

      <PassportMRZLines displayName={displayName} memberSince={memberSince} color={MRZ_COLOR} />

      <DashedLine color={DIVIDER_COLOR} />

      <PassportStatsBlock summary={summary} countryBadges={badges} />

      <DashedLine color={DIVIDER_COLOR} />

      <PassportMRZLines displayName={displayName} memberSince={memberSince} color={MRZ_COLOR} />

      {isFull && onShare ? (
        <PassportShareRow onShare={onShare} testID={testID ? `${testID}-share` : undefined} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    backgroundColor: colors.white,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: -2 },
  },
  cardCompact: {
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 24,
    gap: 12,
    shadowRadius: 23,
  },
  cardFull: {
    borderRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 20,
    shadowRadius: 27,
  },
  cardRender: { width: 360, paddingBottom: 16 },
});
