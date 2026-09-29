/**
 * Receive-friend-request root modal — port of `View/Friend/ReceiveFriendRequestView.swift`.
 * Auto-presented by `useRootModalPresenter` and opened from the pending-request rows.
 * Accept responds to the request; the dismiss button only closes — iOS never declines here.
 */
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mutationErrorMessage } from '@/api/mutationError';
import { useRespondFriendRequest } from '@/features/friends/api/mutations';
import { useFriendRequests } from '@/features/friends/api/queries';
import {
  AddFriendButton,
  FriendRequestDismissButton,
  MutualAvatarStrip,
  RotatingAvatarBadge,
} from '@/features/friends/components';
import { memberSinceYear, ringText } from '@/features/friends/helpers/memberSince';
import { presentedRequests } from '@/features/friends/presentedRequests';
import { markRootModalDismissed } from '@/features/shell/rootModals';
import { useAppLanguage } from '@/i18n';
import { playSheetSound } from '@/native/audio';
import { requireOnline } from '@/offline/guardOnline';
import { InviteBackground, Spinner } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export default function ReceiveFriendRequestScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const requestId = Number(raw);
  useEffect(() => {
    playSheetSound('opening');
  }, []);

  // The list is already in cache (the presenter reads the same query); `useFriendRequests` just
  // re-subscribes and refetches it when it is missing or stale.
  const requests = useFriendRequests();
  const request = requests.data?.find((r) => r.id === requestId);
  const respond = useRespondFriendRequest();

  // Session bookkeeping: never auto-present this request again (`checkPendingFriendRequests`).
  useEffect(() => {
    if (Number.isFinite(requestId)) presentedRequests.add(requestId);
  }, [requestId]);

  // Only clears the window if this modal still owns it: a deep-linked `/friend/[code]` can be
  // pushed on top, and its unmount must not release the request underneath.
  useEffect(() => () => markRootModalDismissed('friendRequest'), []);

  /**
   * Single exit point. Accepting removes the request from the `friends.requests` cache
   * synchronously (`useRespondFriendRequest.onSuccess`), which immediately arms the
   * "resolved elsewhere" effect below — without this guard the screen would pop twice.
   */
  const dismissedRef = useRef(false);
  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    router.back();
  }, []);

  // Resolved elsewhere (accepted on another device, cancelled by the sender) — nothing to show.
  useEffect(() => {
    if (!requests.isPending && !request) dismiss();
  }, [dismiss, request, requests.isPending]);

  const senderName = request?.sender.displayName ?? '';

  const handleAccept = useCallback(async () => {
    if (!requireOnline(t)) return;
    try {
      await respond.mutateAsync({ id: requestId, accept: true });
      playSheetSound('navigate');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
      dismiss();
    } catch (err) {
      Alert.alert(mutationErrorMessage(err, t('Something went wrong')));
    }
  }, [dismiss, requestId, respond, t]);

  return (
    <View style={styles.root} testID="friend-receive-modal">
      <InviteBackground />

      {request ? (
        <View style={[styles.body, { paddingTop: insets.top + 120 }]}>
          <View style={styles.headline}>
            <Text style={styles.title}>{t('Friend request from\n“%@”', { 0: senderName })}</Text>
            <View style={styles.mutualRow}>
              <MutualAvatarStrip />
              <Text style={styles.mutual}>
                {t('%lld mutual friends', { count: request.mutualFriendCount })}
              </Text>
            </View>
          </View>

          <RotatingAvatarBadge
            ringText={ringText(senderName, memberSinceYear(request.sender.memberSince))}
            avatarUrl={request.sender.avatarUrl}
          />

          <AddFriendButton
            title={t('Accept')}
            loading={respond.isPending}
            disabled={respond.isPending}
            onPress={() => void handleAccept()}
            style={styles.accept}
            testID="friend-accept"
          />
        </View>
      ) : (
        <Spinner fill />
      )}

      <FriendRequestDismissButton
        onPress={dismiss}
        disabled={respond.isPending}
        accessibilityLabel={t('Close')}
        style={[styles.dismiss, { bottom: insets.bottom + 60 }]}
        testID="friend-receive-dismiss"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, alignItems: 'center', gap: 50, paddingHorizontal: spacing.xl },
  headline: { alignItems: 'center', gap: 6 },
  title: {
    ...beVietnamPro(24),
    color: colors.contentB,
    textAlign: 'center',
    letterSpacing: -0.96,
  },
  mutualRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  mutual: { ...beVietnamPro(14), color: colors.contentM },
  accept: { width: 150 },
  dismiss: { position: 'absolute', alignSelf: 'center' },
});
