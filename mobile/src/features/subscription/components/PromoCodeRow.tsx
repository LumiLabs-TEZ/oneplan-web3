/**
 * "Have a promo code?" link — port of `PaywallView`'s promo-code button
 * (SubscriptionView.swift:147-165). iOS only: Android has no in-app redemption sheet
 * (`StoreService.redeemOfferCode`).
 */
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface PromoCodeRowProps {
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}

export function PromoCodeRow({
  onPress,
  disabled = false,
  testID = 'paywall-promo',
}: PromoCodeRowProps) {
  useAppLanguage();
  const { t } = useTranslation();

  if (Platform.OS !== 'ios') return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={[styles.row, disabled && styles.disabled]}
    >
      <Text style={styles.label}>{t('Have a promo code?')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', paddingTop: spacing.sm },
  disabled: { opacity: 0.6 },
  label: { ...beVietnamPro(15, 'regular'), color: colors.contentB },
});
