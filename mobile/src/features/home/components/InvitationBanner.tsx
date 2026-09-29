/**
 * Port of `HomeView.swift:327-399` — banner for the oldest pending trip invite.
 * Reads `pendingInvitesStore` directly (no props). "View" sets `activeCode`; the trash declines
 * the invite on the server (iOS only dropped it locally, so it came back on the next sync).
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { mutationErrorMessage } from '@/api/mutationError';
import { useDeclineInvite } from '@/features/invite/api/declineInvite';

import { pendingInvitesStore, usePendingInvitesStore } from '@/features/invite/pendingInvitesStore';
import { useAppLanguage } from '@/i18n';
import { requireOnline } from '@/offline/guardOnline';
import { images } from '@/ui/assets';
import { CachedImage } from '@/ui/components/CachedImage';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { BannerStack } from './BannerStack';

const TRASH_COLOR = 'rgb(224, 37, 36)';
const THUMB_SIZE = 42;

export function InvitationBanner() {
  useAppLanguage();
  const { t } = useTranslation();
  const invites = usePendingInvitesStore((s) => s.invites);
  const invite = invites[0] ?? null;
  const decline = useDeclineInvite();

  if (!invite) return null;

  // Optimistic: the banner animates out immediately; a failed PATCH brings the invite back.
  const handleDecline = () => {
    if (!requireOnline(t)) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    pendingInvitesStore.decline(invite.inviteCode);
    decline.mutate(invite.inviteCode, {
      onSuccess: () => pendingInvitesStore.declineSettled(invite.inviteCode),
      onError: (err) => {
        pendingInvitesStore.declineFailed(invite);
        Alert.alert(mutationErrorMessage(err, t('Something went wrong')));
      },
    });
  };

  const headline = invite.invitedByDisplayName
    ? t('%@ invited you to', { 0: invite.invitedByDisplayName })
    : t('You’ve got an invitation to');

  return (
    <BannerStack count={invites.length} testID="invitation-banner-stack">
      <Animated.View
        key={invite.inviteCode}
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(220)}
        style={styles.container}
      >
        <View style={styles.thumbWrap}>
          {/* iOS `defaultTripPlaceholder` fallback — also covers a slow or expired cover URL. */}
          <Image
            source={images.trip.defaultTripPlaceholder}
            style={[StyleSheet.absoluteFill, styles.thumb]}
            resizeMode="cover"
          />
          <CachedImage uri={invite.coverImageUrl} style={styles.thumb} />
          <View pointerEvents="none" style={styles.thumbBorder} />
        </View>
        <View style={styles.body}>
          <Text style={styles.headline} numberOfLines={1} ellipsizeMode="tail">
            {headline}
          </Text>
          <Text style={styles.tripName} numberOfLines={1} ellipsizeMode="tail">
            {invite.tripName}
          </Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            testID="invitation-banner-view"
            onPress={() => pendingInvitesStore.present(invite.inviteCode)}
            style={styles.viewButton}
          >
            <Text style={styles.viewLabel}>{t('View')}</Text>
          </Pressable>
          <Pressable
            testID="invitation-banner-dismiss"
            onPress={handleDecline}
            style={styles.trashButton}
            accessibilityRole="button"
            accessibilityLabel={t('Dismiss invitation')}
          >
            <Ionicons name="trash" size={14} color={colors.white} />
          </Pressable>
        </View>
      </Animated.View>
    </BannerStack>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.white,
    shadowColor: '#000000',
    shadowOpacity: 0.09,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  thumbWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 14,
    backgroundColor: colors.white,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 15.64,
    shadowOffset: { width: 0, height: 1.955 },
    elevation: 4,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 14,
  },
  thumbBorder: {
    position: 'absolute',
    top: 0.24,
    left: 0.24,
    right: 0.24,
    bottom: 0.24,
    borderRadius: 13.76,
    borderWidth: 0.49,
    borderColor: 'rgba(0, 0, 0, 0.15)',
  },
  body: {
    flex: 1,
    gap: spacing.xxs,
  },
  headline: {
    ...beVietnamPro(14),
    letterSpacing: -0.28,
    color: colors.contentL,
  },
  tripName: {
    ...beVietnamPro(15),
    letterSpacing: -0.3,
    color: colors.contentB,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  viewButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.blueBase,
  },
  viewLabel: {
    ...beVietnamPro(14),
    letterSpacing: -0.28,
    color: colors.white,
  },
  trashButton: {
    width: 29,
    height: 29,
    borderRadius: radius.pill,
    backgroundColor: TRASH_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
