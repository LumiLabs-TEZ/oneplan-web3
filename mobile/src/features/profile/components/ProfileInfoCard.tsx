/** Port of `ProfileView.swift:279` — name/friend-code + QR header, email row, subscription row. */
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StyledQRCode as QRCode } from '@/ui/components/StyledQRCode';

import type { UserProfileDto } from '@/features/me/useMe';
import { useAppLanguage } from '@/i18n';
import { friendUrl } from '@/links/deepLinkBuilder';
import { ProBadge } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { LOCKED_FRIEND_CODE_LABEL, resolveDisplayName } from '../helpers/profileLabels';

const QR_SIZE = 64;

export interface ProfileInfoCardProps {
  profile: UserProfileDto | undefined;
  isPro: boolean;
  onQrPress: () => void;
  onGetPro: () => void;
  testID?: string;
}

export function ProfileInfoCard({
  profile,
  isPro,
  onQrPress,
  onGetPro,
  testID,
}: ProfileInfoCardProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const name = resolveDisplayName(profile?.displayName, t('One Plan User'));

  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.headerRow}>
        <View style={styles.nameCol}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.code}>{LOCKED_FRIEND_CODE_LABEL}</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={onQrPress}
          testID={testID ? `${testID}-qr` : undefined}
        >
          {profile?.friendCode ? (
            <QRCode
              value={friendUrl(profile.friendCode)}
              size={QR_SIZE}
              color={colors.blueBase}
              backgroundColor={colors.surface}
            />
          ) : (
            <Ionicons name="qr-code-outline" size={QR_SIZE} color={colors.blueBase} />
          )}
        </Pressable>
      </View>

      <View style={styles.divider} />

      <View style={[styles.row, styles.emailRow]}>
        <Text style={styles.rowLabel}>{t('Email')}</Text>
        <Text style={styles.rowValue} numberOfLines={1}>
          {profile?.email ?? ''}
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.row}>
        <Text style={styles.rowLabel}>{t('Subscription')}</Text>
        {isPro ? (
          <ProBadge testID={testID ? `${testID}-pro-badge` : undefined} />
        ) : (
          <View style={styles.basicRow}>
            <Text style={styles.rowValue}>{t('Basic')}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={onGetPro}
              testID="profile-get-pro"
              style={styles.getProButton}
            >
              <Text style={styles.getProLabel}>{t('Get Pro')}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 4,
    backgroundColor: colors.surface,
    borderRadius: 24,
    boxShadow: '0px 0px 18px rgba(0,0,0,0.06)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  nameCol: { flex: 1, gap: 4 },
  name: { ...beVietnamPro(18), color: colors.contentB },
  code: {
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.contentM,
  },
  divider: { height: 1, backgroundColor: colors.neutral100 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.md,
  },
  emailRow: { paddingVertical: 14 },
  rowLabel: { ...beVietnamPro(14), letterSpacing: -0.7, color: colors.contentM, flex: 1 },
  rowValue: { ...beVietnamPro(16), letterSpacing: -0.64, color: colors.contentB },
  basicRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  getProButton: {
    backgroundColor: colors.blueBase,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    minWidth: 65,
    alignItems: 'center',
  },
  getProLabel: { ...beVietnamPro(14), color: colors.white },
});
