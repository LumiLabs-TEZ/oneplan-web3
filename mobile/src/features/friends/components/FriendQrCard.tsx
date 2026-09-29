/**
 * QR code + share row for the invite screen. Port of the QR/share block in
 * `InviteView.contentContainer` (InviteView.swift:166-213). `lastScannedCode` overrides the URL
 * row with the raw scanned text (iOS `lastScannedCode` behaviour) but the Share action always
 * shares the user's own friend URL.
 */
import { useTranslation } from 'react-i18next';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { StyledQRCode as QRCode } from '@/ui/components/StyledQRCode';

import { useAppLanguage } from '@/i18n';
import { friendUrl } from '@/links/deepLinkBuilder';
import { Spinner } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const QR_SIZE = 222;

export interface FriendQrCardProps {
  friendCode?: string | null;
  lastScannedCode?: string | null;
}

export function FriendQrCard({ friendCode, lastScannedCode }: FriendQrCardProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const url = friendCode ? friendUrl(friendCode) : undefined;
  const displayText = lastScannedCode ?? url ?? '';

  const share = () => {
    if (!url) return;
    void Share.share({ message: url, title: t('Add me on OnePlan') });
  };

  return (
    <View style={styles.card} testID="friend-qr">
      {url ? (
        <QRCode
          value={url}
          size={QR_SIZE}
          color={colors.blueBase}
          backgroundColor={colors.surface}
        />
      ) : (
        <View style={styles.qrPlaceholder} testID="friend-qr-loading">
          <Spinner />
        </View>
      )}

      <View style={styles.shareRow} testID="invite-url">
        <Text style={styles.link} numberOfLines={1} ellipsizeMode="tail">
          {displayText}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !url }}
          disabled={!url}
          onPress={share}
          testID="invite-share"
          style={({ pressed }) => [
            styles.shareChip,
            !url && styles.shareChipDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.shareLabel}>{t('Share')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  qrPlaceholder: {
    width: QR_SIZE,
    height: QR_SIZE,
    borderRadius: radius.md,
    backgroundColor: colors.neutral100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.onSurface,
    borderRadius: radius.xl,
  },
  link: { ...beVietnamPro(16), color: colors.contentB, flex: 1 },
  // `Chip(variant: .blue, verticalPadding: 8)`.
  shareChip: {
    backgroundColor: colors.blueBase,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  shareChipDisabled: { backgroundColor: colors.neutral200, opacity: 0.4 },
  shareLabel: { ...beVietnamPro(14), color: colors.white },
  pressed: { opacity: 0.8 },
});
