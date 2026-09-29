import { useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

import { barWidth, type PassportDistributionRow } from '@/features/passport/helpers/distribution';
import { NumericText } from '@/ui/components/NumericText';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface PassportDistributionSectionProps {
  title: string;
  /**
   * Header count, drawn zero-padded to two digits ("04", iOS `pad2`). NOT `rows.length` — iOS
   * reads this off `summary.citiesCount`/`countriesCount` (`PassportView.swift:171-179`), a
   * separate field from `topCities`/`topCountries` (which are capped to a top-N list). Negative
   * counts clamp to 0.
   */
  total: number;
  totalSuffix: string;
  rows: PassportDistributionRow[];
  testID?: string;
}

/**
 * Top-cities / top-countries distribution bars — port of `PassportView.swift:247-277`
 * (`PassportDistributionSection` + `PassportDistributionRowView`).
 */
export function PassportDistributionSection({
  title,
  total,
  totalSuffix,
  rows,
  testID,
}: PassportDistributionSectionProps) {
  const maxCount = Math.max(...rows.map((row) => row.count), 1);

  return (
    <View style={styles.section} testID={testID}>
      <View style={styles.divider} />

      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.totalRow}>
          <NumericText
            value={Math.max(total, 0)}
            minimumIntegerDigits={2}
            useGrouping={false}
            style={styles.totalValue}
          />
          <Text style={styles.totalSuffix}>{totalSuffix}</Text>
        </View>
      </View>

      <View style={styles.rows}>
        {rows.map((row) => (
          <DistributionRowView key={row.label} row={row} maxCount={maxCount} />
        ))}
      </View>
    </View>
  );
}

function DistributionRowView({
  row,
  maxCount,
}: {
  row: PassportDistributionRow;
  maxCount: number;
}) {
  const [available, setAvailable] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    setAvailable(event.nativeEvent.layout.width);
  };

  return (
    <View style={styles.row}>
      <Text style={styles.label} numberOfLines={1}>
        {row.label}
      </Text>
      <View
        style={styles.barTrack}
        onLayout={onLayout}
        testID={`passport-distribution-track-${row.label}`}
      >
        <View style={[styles.bar, { width: barWidth(row.count, maxCount, available) }]} />
      </View>
      <NumericText value={row.count} useGrouping={false} style={styles.count} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.lg },
  divider: { height: 1, backgroundColor: colors.neutral100 },
  header: { gap: spacing.md, paddingHorizontal: spacing.lg },
  title: { ...beVietnamPro(14), color: colors.contentB },
  totalRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  totalValue: { ...beVietnamPro(24, 'medium'), color: colors.contentB },
  totalSuffix: { ...beVietnamPro(16), color: colors.contentL },
  rows: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  label: { ...beVietnamPro(14), color: colors.contentB, letterSpacing: -0.7, width: 90 },
  barTrack: { flex: 1, height: 10, justifyContent: 'center' },
  bar: { height: 10, borderRadius: 999, backgroundColor: colors.blueBase },
  count: { ...beVietnamPro(14), color: colors.contentM, letterSpacing: -0.7 },
});
