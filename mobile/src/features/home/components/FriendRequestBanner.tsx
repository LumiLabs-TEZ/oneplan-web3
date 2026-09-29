/**
 * Home banner for the oldest pending incoming friend request — sibling of `InvitationBanner`
 * (same card, View pill and red trash). "View" opens the `/friend-request/[id]` modal; the trash
 * declines on the server, so the request never comes back on the next fetch or relaunch. The
 * modal's own close button only closes — this banner stays until the request is resolved.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { mutationErrorMessage } from '@/api/mutationError';
import { useDeclineFriendRequest } from '@/features/friends/api/mutations';
import { useFriendRequests } from '@/features/friends/api/queries';
import { useAppLanguage } from '@/i18n';
import { requireOnline } from '@/offline/guardOnline';
import { Avatar } from '@/ui/components/Avatar';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { BannerStack } from './BannerStack';

const TRASH_COLOR = 'rgb(224, 37, 36)';
const AVATAR_SIZE = 42;

export function FriendRequestBanner() {
  useAppLanguage();
  const { t } = useTranslation();
  const requests = useFriendRequests();
  const decline = useDeclineFriendRequest();

  // The API sorts newest first; surface the oldest so requests are handled in arrival order.
  const pending = requests.data ?? [];
  const request = pending.at(-1) ?? null;
  if (!request) return null;

  const handleDecline = () => {
    if (!requireOnline(t)) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    decline.mutate(request.id, {
      onError: (err) => Alert.alert(mutationErrorMessage(err, t('Something went wrong'))),
    });
  };

  return (
    <BannerStack count={pending.length} testID="friend-request-banner-stack">
      <Animated.View
        key={request.id}
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(220)}
        style={styles.container}
        testID="friend-request-banner"
      >
        <Avatar uri={request.sender.avatarUrl} size={AVATAR_SIZE} />
        <View style={styles.body}>
          <Text style={styles.headline} numberOfLines={1} ellipsizeMode="tail">
            {t('New friend request')}
          </Text>
          <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
            {request.sender.displayName}
          </Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            testID="friend-request-banner-view"
            onPress={() =>
              router.push({ pathname: '/friend-request/[id]', params: { id: String(request.id) } })
            }
            style={styles.viewButton}
            accessibilityRole="button"
          >
            <Text style={styles.viewLabel}>{t('View')}</Text>
          </Pressable>
          <Pressable
            testID="friend-request-banner-decline"
            onPress={handleDecline}
            disabled={decline.isPending}
            style={styles.trashButton}
            accessibilityRole="button"
            accessibilityLabel={t('Decline')}
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
  body: {
    flex: 1,
    gap: spacing.xxs,
  },
  headline: {
    ...beVietnamPro(14),
    letterSpacing: -0.28,
    color: colors.contentL,
  },
  name: {
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
