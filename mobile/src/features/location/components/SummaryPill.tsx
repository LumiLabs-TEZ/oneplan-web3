/**
 * Capsule pill in the location-detail summary strip — port of `SummaryPill`
 * (`ios/OnePlan/OnePlan/Component/Common/Pills.swift`): translucent surface, hairline stroke,
 * soft shadow, optional leading glyph.
 */
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface SummaryPillProps {
  title: string;
  icon?: ComponentProps<typeof Ionicons>['name'];
  testID?: string;
}

export function SummaryPill({ title, icon, testID }: SummaryPillProps) {
  return (
    <View style={styles.pill} testID={testID}>
      {icon ? (
        <View style={styles.icon}>
          <Ionicons name={icon} size={15} color={colors.contentB} />
        </View>
      ) : null}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 0.8,
    borderColor: colors.neutral100,
    boxShadow: '0px 1px 6px rgba(0,0,0,0.08)',
  },
  icon: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  title: { ...beVietnamPro(14), color: colors.contentB, letterSpacing: -0.7 },
});
