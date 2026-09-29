/** Port of `FriendsListView.emptyState` (`FriendsListView.swift:181-200`). */
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export function FriendsEmpty() {
  useAppLanguage();
  const { t } = useTranslation();

  return (
    <View style={styles.root} testID="friends-empty">
      <Ionicons name="people-outline" size={32} color={colors.contentL} />
      <Text style={styles.title}>{t('No friends yet')}</Text>
      <Text style={styles.body}>
        {t('Share your QR code or friend code to connect with others')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 40,
    backgroundColor: colors.surface,
    borderRadius: 24,
  },
  title: { ...beVietnamPro(16, 'medium'), color: colors.contentB },
  body: {
    ...beVietnamPro(13),
    color: colors.contentM,
    textAlign: 'center',
    paddingHorizontal: spacing.xxl,
  },
});
