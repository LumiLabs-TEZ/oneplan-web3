/**
 * Header row of the invite QR screen — avatar, display name, and the invite note.
 * Port of the top `HStack` in `InviteView.contentContainer` (InviteView.swift:114-165).
 */
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { Avatar } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface InviteProfileCardProps {
  name?: string | null;
  avatarUrl?: string | null;
}

export function InviteProfileCard({ name, avatarUrl }: InviteProfileCardProps) {
  useAppLanguage();
  const { t } = useTranslation();

  return (
    <View style={styles.row} testID="invite-profile-card">
      <Avatar uri={avatarUrl} size={48} />
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {name || t('One Plan User')}
        </Text>
        <Text style={styles.note} numberOfLines={2}>
          {t('Hey! Let’s add friend and travel together.')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerStroke,
  },
  text: { flex: 1, gap: spacing.xs },
  name: { ...beVietnamPro(16, 'medium'), color: colors.contentB },
  note: { ...beVietnamPro(14), color: colors.contentM },
});
