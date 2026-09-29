import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface CommunityProfileRowProps {
  testID?: string;
}

export function CommunityProfileRow({ testID }: CommunityProfileRowProps) {
  useAppLanguage();
  const { t } = useTranslation();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/market/owner')}
      testID={testID}
      style={styles.row}
    >
      <Text style={styles.label}>{t('Community profile')}</Text>
      <Ionicons name="chevron-forward" size={14} color={colors.contentM} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 14,
  },
  label: { ...beVietnamPro(14), color: colors.contentB, flex: 1 },
});
