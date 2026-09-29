/**
 * Send-friend-request root modal — port of `View/Friend/SendFriendRequestView.swift`.
 * Reached from a `oneplan://friend/{code}` deep link, the invite screen's QR scanner, or the
 * root-modal presenter. Full-screen, non-dismissable by gesture (registered in `_layout.tsx`).
 */
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { keys } from '@/api/keys';
import { mutationErrorMessage } from '@/api/mutationError';
import { useCancelFriendRequest, useSendFriendRequest } from '@/features/friends/api/mutations';
import { useFriendPreview } from '@/features/friends/api/queries';
import {
  AddFriendButton,
  FriendRequestDismissButton,
  PassportSummarySection,
  RotatingAvatarBadge,
} from '@/features/friends/components';
import {
  memberSinceLabel,
  memberSinceYear,
  ringText,
} from '@/features/friends/helpers/memberSince';
import type { FriendRequestStatus } from '@/features/friends/types';
import {
  activeRootModal,
  markRootModalDismissed,
  setActiveRootModal,
} from '@/features/shell/rootModals';
import { useAppLanguage } from '@/i18n';
import { requireOnline } from '@/offline/guardOnline';
import { Button } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

/** iOS `.redacted(reason: .placeholder)` stand-in while the preview loads. */
const SKELETON_OPACITY = 0.4;

export default function SendFriendRequestScreen() {
  const language = useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = typeof raw === 'string' ? raw : '';

  const preview = useFriendPreview(code);
  const queryClient = useQueryClient();
  const send = useSendFriendRequest();
  const cancel = useCancelFriendRequest();

  // iOS mutates its local `preview` copy and tracks the two "this session" flags so the action
  // area can show the confirmation text instead of bouncing back to a button on refetch.
  const [overrideStatus, setOverrideStatus] = useState<FriendRequestStatus | null>(null);
  const [didSend, setDidSend] = useState(false);
  const [didCancel, setDidCancel] = useState(false);

  // Friend codes are never queued by the presenter — this screen is always navigated to directly
  // (deep link, QR scan, Members "Add"), so it claims the root-modal window itself so nothing
  // else (a friend request, a trip invite) lands on top of it. If another modal already owns the
  // window we leave it alone and simply render on top.
  //
  // The cleanup frees the window for the next queued modal
  // (`OnePlanApp.dismissActiveRootModal`) — but only if this modal still owns it (a deep-linked
  // send sheet can sit on top of a live friend-request modal).
  useEffect(() => {
    if (activeRootModal() === null) setActiveRootModal({ kind: 'friendCode', code });
    return () => markRootModalDismissed('friendCode');
  }, [code]);

  const status = overrideStatus ?? preview.data?.requestStatus ?? null;
  const displayName = preview.data?.displayName ?? '...';
  const memberSince = preview.data?.memberSince ?? null;

  const handleSend = useCallback(async () => {
    if (!requireOnline(t)) return;
    try {
      await send.mutateAsync(code);
      setOverrideStatus('pending_sent');
      setDidSend(true);
      setDidCancel(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
    } catch (err) {
      Alert.alert(mutationErrorMessage(err, t('Failed to send request')));
    }
  }, [code, send, t]);

  const handleCancel = useCallback(async () => {
    if (!requireOnline(t)) return;
    try {
      await cancel.mutateAsync(code);
      setOverrideStatus('none');
      setDidSend(false);
      setDidCancel(true);
    } catch (err) {
      Alert.alert(mutationErrorMessage(err, t('Failed to cancel request')));
    }
  }, [cancel, code, t]);

  const dismiss = useCallback(() => {
    // The preview is stale the moment this closes (status may have flipped).
    void queryClient.invalidateQueries({ queryKey: keys.friends.preview(code) });
    router.back();
  }, [code, queryClient]);

  return (
    <View style={styles.root} testID="friend-send-modal">
      <View
        style={[
          styles.body,
          { paddingTop: insets.top + spacing.xl },
          preview.isLoading ? styles.skeleton : null,
        ]}
      >
        <RotatingAvatarBadge
          ringText={ringText(preview.data?.displayName ?? 'Bella Oi', memberSinceYear(memberSince))}
          avatarUrl={preview.data?.avatarUrl}
        />

        <View style={styles.identity}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {displayName}
            </Text>
            <Ionicons name="checkmark-circle" size={16} color={colors.blueBase} />
          </View>
          {preview.data ? (
            <Text style={styles.memberSince}>{memberSinceLabel(memberSince, language, t)}</Text>
          ) : null}
        </View>

        <View style={styles.actionArea}>
          {preview.isError ? <Text style={styles.error}>{t('Failed to load profile')}</Text> : null}
          {status === 'friends' ? <Text style={styles.note}>{t('Already friends')}</Text> : null}
          {status === 'pending_received' ? (
            <Text style={styles.note}>{t('Pending your response')}</Text>
          ) : null}
          {status === 'pending_sent' ? (
            didSend ? (
              <Text style={styles.note} testID="friend-request-sent">
                {t('Request sent')}
              </Text>
            ) : (
              <Button
                variant="secondary"
                title={t('Cancel Request')}
                loading={cancel.isPending}
                disabled={cancel.isPending}
                onPress={() => void handleCancel()}
                style={styles.actionButton}
                testID="friend-cancel-request"
              />
            )
          ) : null}
          {status === 'none' ? (
            didCancel ? (
              <Text style={styles.note}>{t('Request canceled')}</Text>
            ) : (
              <AddFriendButton
                title={t('Add Friend')}
                loading={send.isPending}
                disabled={send.isPending}
                onPress={() => void handleSend()}
                style={styles.actionButton}
                testID="friend-add"
              />
            )
          ) : null}
        </View>

        {preview.data ? (
          <View style={styles.passport}>
            <PassportSummarySection
              tripCount={preview.data.tripCount}
              countryCount={preview.data.countryCount}
              cityCount={preview.data.cityCount}
              displayName={preview.data.displayName}
              memberSince={preview.data.memberSince}
              testID="friend-send-passport"
            />
          </View>
        ) : null}
      </View>

      <FriendRequestDismissButton
        onPress={dismiss}
        accessibilityLabel={t('Close')}
        style={[styles.dismiss, { bottom: insets.bottom + 33 }]}
        testID="friend-send-dismiss"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, alignItems: 'center', paddingHorizontal: 18, paddingBottom: spacing.xxl },
  skeleton: { opacity: SKELETON_OPACITY },
  identity: { alignItems: 'center', gap: spacing.sm, paddingTop: 19 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...beVietnamPro(20), color: colors.contentB, letterSpacing: -1 },
  memberSince: { ...beVietnamPro(14), color: colors.contentM, letterSpacing: -0.6 },
  actionArea: { width: 150, alignItems: 'center', paddingTop: 19 },
  actionButton: { width: '100%' },
  note: { ...beVietnamPro(14), color: colors.contentM, textAlign: 'center' },
  error: { ...beVietnamPro(14), color: colors.secondary, textAlign: 'center' },
  passport: { alignSelf: 'stretch', paddingTop: 38 },
  dismiss: { position: 'absolute', alignSelf: 'center' },
});
