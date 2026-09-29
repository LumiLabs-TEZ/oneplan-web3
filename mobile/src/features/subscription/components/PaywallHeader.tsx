/**
 * Paywall hero header — "One Plan" wordmark + `Pro` pill + logo badge
 * (`SubscriptionView` body :854-886).
 */
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { OnePlanProLogoBadge } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface PaywallHeaderProps {
  testID?: string;
}

export function PaywallHeader({ testID }: PaywallHeaderProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const { fontScale } = useWindowDimensions();

  return (
    <View style={styles.root} testID={testID}>
      <View style={[styles.titleRow, fontScale > 1.3 && { flexDirection: 'column' }]}>
        <Text style={styles.title}>{t('One Plan')}</Text>
        <View style={styles.pill}>
          <Text style={styles.pillLabel}>{t('Pro')}</Text>
        </View>
      </View>
      <OnePlanProLogoBadge size={68} showsShadow={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 15, alignSelf: 'stretch' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, maxWidth: '100%' },
  // White over the `MarketTopGlow` blue hero, as in `SubscriptionView`.
  title: {
    ...beVietnamPro(24, 'semibold'),
    letterSpacing: -0.72,
    color: colors.white,
    flexShrink: 1,
    textAlign: 'center',
  },
  pill: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.blueBase,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  pillLabel: { ...beVietnamPro(13), letterSpacing: -0.52, color: colors.blueBase },
});
