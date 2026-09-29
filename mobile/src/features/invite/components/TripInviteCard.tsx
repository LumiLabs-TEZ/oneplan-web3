/**
 * Port of `Component/Trip/TripInviteCard.swift` (minus the friends section, which
 * needs the Phase 3 friend list): trip header, QR code for the invite deep link,
 * and the share-link row. Shared by the invite screen and the first-open sheet.
 */
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { Share, StyleSheet, Text, View } from 'react-native';
import { StyledQRCode as QRCode } from '@/ui/components/StyledQRCode';

import { useAppLanguage } from '@/i18n';
import { tripUrl } from '@/links/deepLinkBuilder';
import { Avatar, Pill } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const QR_SIZE = 222;

export interface TripInviteCardProps {
  tripName: string;
  coverImageUrl?: string | null;
  inviteCode: string;
}

export function TripInviteCard({ tripName, coverImageUrl, inviteCode }: TripInviteCardProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const url = tripUrl(inviteCode);

  const share = () => {
    void Share.share({ message: url, title: t('Join %@ on OnePlan', { 0: tripName }) });
  };

  return (
    <View style={styles.card} testID="trip-invite-card">
      <View style={styles.header}>
        <Avatar uri={coverImageUrl} size={48} />
        <View style={styles.headerText}>
          <Text style={styles.tripName} numberOfLines={2}>
            {tripName}
          </Text>
          <Text style={styles.subtitle}>
            {t('Join the group and plan together by scanning the QR code below!')}
          </Text>
        </View>
      </View>

      <View style={styles.qr} testID="trip-invite-qr">
        <QRCode
          value={url}
          size={QR_SIZE}
          color={colors.blueBase}
          backgroundColor={colors.surface}
        />
      </View>

      <View style={styles.shareRowOuter}>
        <View style={styles.shareRow}>
          <Text style={styles.link} numberOfLines={1} ellipsizeMode="tail">
            {url}
          </Text>
          <Pill
            label={t('Share')}
            selected
            onPress={share}
            onLongPress={() => void Clipboard.setStringAsync(url)}
            style={styles.sharePill}
            testID="trip-invite-share"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'stretch',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.dividerStroke,
  },
  headerText: { flex: 1, gap: spacing.xs },
  tripName: { ...beVietnamPro(16, 'medium'), color: colors.contentB },
  subtitle: { ...beVietnamPro(14), color: colors.contentM },
  qr: { paddingVertical: spacing.sm },
  shareRowOuter: { alignSelf: 'stretch', paddingHorizontal: spacing.lg },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.onSurface,
    borderRadius: radius.xl,
  },
  link: { ...beVietnamPro(16), color: colors.contentB, flex: 1 },
  sharePill: { paddingVertical: spacing.sm },
});
