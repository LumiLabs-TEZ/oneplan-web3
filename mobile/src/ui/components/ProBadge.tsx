import { useTranslation } from 'react-i18next';
import { StyleSheet, type StyleProp, Text, View, type ViewStyle } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface ProBadgeProps {
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** "Pro" pill — port of `ProBadge.swift` (blueBase stroke, radius 6, 13 medium). */
export function ProBadge({ style, testID }: ProBadgeProps) {
  useAppLanguage();
  const { t } = useTranslation();
  return (
    <View style={[styles.badge, style]} testID={testID}>
      <Text style={styles.label}>{t('Pro')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.blueBase,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  label: { ...beVietnamPro(13, 'medium'), letterSpacing: -0.52, color: colors.blueBase },
});
