/**
 * Centered pill row at the top of the detail sheet — distance from the user + plan count, over a
 * hairline. Port of `LocationDetailSummaryStrip`
 * (`ios/OnePlan/OnePlan/Component/LocationDetail/LocationDetailSummaryStrip.swift`).
 */
import { StyleSheet, View } from 'react-native';

import { colors } from '@/ui/theme';

import { PlanCountPill } from './PlanCountPill';
import { SummaryPill } from './SummaryPill';

export interface LocationSummaryStripProps {
  /** `null` until the user's location is known — the distance pill is hidden. */
  distanceText: string | null;
  /** Place name for the plan-count lookup. */
  locationName: string;
  testID?: string;
}

export function LocationSummaryStrip({
  distanceText,
  locationName,
  testID,
}: LocationSummaryStripProps) {
  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.line} />
      <View style={styles.pills}>
        {distanceText ? (
          <SummaryPill icon="swap-horizontal" title={distanceText} testID="location-distance" />
        ) : null}
        <PlanCountPill location={locationName} testID="plan-count" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { justifyContent: 'center', paddingTop: 4, paddingBottom: 20, minHeight: 64 },
  line: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1,
    backgroundColor: colors.neutral100,
  },
  pills: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
});
