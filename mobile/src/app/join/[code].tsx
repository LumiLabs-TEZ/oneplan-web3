import { activeRootModal } from '@/features/shell/rootModals';
import { playSheetSound } from '@/native/audio';
/**
 * Drag-to-join screen — port of `View/Trip/TripInvitationView.swift`. The avatar
 * is dragged into the trip cover card; 95% of the track fires `POST /trips/join`.
 * Presented full-screen both from a deep link and from `useRootModalPresenter`.
 */
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { useInvitePreview } from '@/features/invite/api/queries';
import { InvitationDragPreview } from '@/features/invite/components';
import { hasOngoingConflict } from '@/features/invite/helpers/dragToJoin';
import {
  isWeb3UnavailableError,
  ongoingConflictFromError,
} from '@/features/invite/helpers/joinConflict';
import { pendingInvitesStore } from '@/features/invite/pendingInvitesStore';
import { markInvitePresented } from '@/features/invite/presenterState';
import { FriendRequestDismissButton } from '@/features/friends/components';
import { EmptyOffline } from '@/features/home/components';
import { useMe } from '@/features/me/useMe';
import { invalidateTripLists, useJoinTrip } from '@/features/trip/api/mutations';
import { useTrips } from '@/features/trip/api/queries';
import { partitionTrips } from '@/features/trip/helpers/partitionTrips';
import { useAppLanguage } from '@/i18n';
import { useIsOnline } from '@/offline/servingCached';
import { InviteBackground } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

/** iOS keeps the avatar pinned in the card for a beat before routing to the trip. */
const JOINED_HOLD_MS = 600;
/**
 * iOS measures both from the screen edges, not the safe area: the full-bleed background makes
 * the SwiftUI ZStack span the whole screen (measured on-device against `TripInvitationView`).
 */
const SCREEN_TOP_PADDING = 100;
const DISMISS_BOTTOM = 60;
const WEB3_REGION_MESSAGE = "This trip uses a group wallet, which isn't available in your region.";

export default function JoinScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = typeof raw === 'string' ? raw : '';
  const online = useIsOnline();

  const preview = useInvitePreview(code);
  useEffect(() => {
    if (activeRootModal()?.kind === 'tripInvite') playSheetSound('opening');
  }, []);
  const trips = useTrips();
  const me = useMe();
  const join = useJoinTrip();
  const queryClient = useQueryClient();

  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [joinedName, setJoinedName] = useState<string | null>(null);

  const tripName = joinedName ?? preview.data?.name ?? t('Trip Invitation');
  const memberCount = preview.data?.memberCount ?? 0;
  const ongoing = partitionTrips(trips.data ?? []).ongoing;
  // A web3 trip is closed to a non-eligible region (e.g. Vietnam without a VPN).
  const web3Blocked =
    preview.data?.web3 === true && !preview.data.web3Eligible && !preview.data.isMember;

  // Claim the presentation first: a deep link mounts this screen without going
  // through `useRootModalPresenter`, and marking the code active (a) keeps `upsert`
  // from enqueueing it and (b) tells the presenter it is already on screen — both
  // of which would otherwise push a second copy of this route.
  useEffect(() => {
    if (!code) return;
    pendingInvitesStore.present(code);
    markInvitePresented(code);
  }, [code]);

  // Only a *verified* invite joins the persisted banner list, so a bogus or
  // revoked deep-link code can't park itself on Home forever.
  useEffect(() => {
    if (!code || !preview.data) return;
    pendingInvitesStore.upsert(
      {
        inviteCode: code,
        tripName: preview.data.name,
        coverImageUrl: preview.data.coverImageUrl ?? null,
        invitedByDisplayName: '',
      },
      'deepLink',
    );
  }, [code, preview.data]);

  // Android back / any unmount without joining: stop presenting this code so the
  // queue can move on (the invite itself stays in the store for the banner).
  useEffect(
    () => () => {
      if (pendingInvitesStore.peekActive() === code) pendingInvitesStore.dismissActive();
    },
    [code],
  );

  const showConflict = useCallback(
    (existingTripName: string | undefined) => {
      // Reset before presenting: the alert can be dismissed by tapping OK, the
      // Android back button or a system interruption, and the avatar must not be
      // left latched at the bottom of the track in any of those paths.
      setResetSignal((n) => n + 1);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      Alert.alert(
        t('Already on a Trip'),
        existingTripName
          ? t('You\'re currently on "%@". End that trip before joining another ongoing trip.', {
              0: existingTripName,
            })
          : t('You already have an ongoing trip. End it before joining another.'),
        [{ text: t('OK') }],
      );
    },
    [t],
  );

  const openTrip = useCallback((tripId: number) => {
    playSheetSound('navigate');
    router.replace({ pathname: '/trip/[tripId]', params: { tripId: String(tripId) } });
  }, []);

  const handleJoin = useCallback(async () => {
    if (isJoining || !code || web3Blocked) return;
    // Already an accepted member (re-opened invite link): nothing to join, and the
    // ongoing-trip rule doesn't apply — just go to the trip.
    if (preview.data?.isMember) {
      pendingInvitesStore.resolve(code);
      openTrip(preview.data.tripId);
      return;
    }
    if (hasOngoingConflict(preview.data?.status, ongoing ? 1 : 0)) {
      showConflict(ongoing?.name);
      return;
    }
    setIsJoining(true);
    setError(null);
    try {
      const trip = await join.mutateAsync(code);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
      setJoinedName(trip.name);
      await new Promise((resolve) => setTimeout(resolve, JOINED_HOLD_MS));
      pendingInvitesStore.resolve(code);
      await invalidateTripLists(queryClient);
      openTrip(trip.id);
    } catch (err) {
      setIsJoining(false);
      if (isWeb3UnavailableError(err)) {
        setResetSignal((n) => n + 1);
        setError(t(WEB3_REGION_MESSAGE));
        return;
      }
      const conflict = ongoingConflictFromError(err);
      if (conflict) {
        showConflict(conflict.existingTripName || ongoing?.name);
        return;
      }
      setResetSignal((n) => n + 1);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      setError(t('Failed to join trip'));
    }
  }, [
    code,
    isJoining,
    join,
    ongoing,
    openTrip,
    preview.data,
    queryClient,
    showConflict,
    t,
    web3Blocked,
  ]);

  // Stable identity: rebuilding this mid-drag would recreate the Pan gesture.
  const handleJoinTriggered = useCallback(() => {
    void handleJoin();
  }, [handleJoin]);

  const dismiss = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    pendingInvitesStore.dismissActive();
    router.back();
  };

  return (
    <View style={styles.root}>
      <InviteBackground />

      <View style={[styles.body, { paddingTop: SCREEN_TOP_PADDING }]}>
        {online ? (
          <>
            <View style={styles.headline}>
              {isJoining ? (
                <Text style={styles.title}>{t('Joining group...')}</Text>
              ) : error ? (
                <Text style={styles.error}>{error}</Text>
              ) : web3Blocked ? (
                <Text style={styles.error} testID="invite-web3-blocked">
                  {t(WEB3_REGION_MESSAGE)}
                </Text>
              ) : (
                <>
                  <Text style={styles.title}>{t("You've got an invitation to\njoin a group")}</Text>
                  <Text style={styles.subtitle}>{t('Drag to join')}</Text>
                </>
              )}
            </View>

            <InvitationDragPreview
              coverImageUrl={preview.data?.coverImageUrl}
              avatarUrl={me.data?.avatarUrl}
              isJoining={isJoining}
              disabled={web3Blocked}
              resetSignal={resetSignal}
              onJoinTriggered={handleJoinTriggered}
            />

            <View style={styles.footer}>
              <Text style={styles.tripName} numberOfLines={2}>
                {tripName}
              </Text>
              <Text style={styles.members}>
                {t('%lld members in this group', { count: memberCount })}
              </Text>
            </View>
          </>
        ) : (
          <EmptyOffline style={styles.empty} />
        )}
      </View>

      <FriendRequestDismissButton
        onPress={dismiss}
        accessibilityLabel={t('Close')}
        style={[styles.dismiss, { bottom: DISMISS_BOTTOM }]}
        testID="invite-dismiss"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  // SwiftUI VStack default spacing between headline, drag preview and footer.
  body: { flex: 1, alignItems: 'center', gap: spacing.sm },
  headline: { alignItems: 'center', gap: 6 },
  title: {
    ...beVietnamPro(24),
    color: colors.contentB,
    textAlign: 'center',
    letterSpacing: -0.96,
  },
  subtitle: { ...beVietnamPro(14), color: colors.contentM, letterSpacing: -0.6 },
  error: {
    ...beVietnamPro(18),
    color: colors.secondary,
    textAlign: 'center',
    letterSpacing: -0.72,
  },
  footer: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl },
  tripName: {
    ...beVietnamPro(24),
    color: colors.contentB,
    textAlign: 'center',
    letterSpacing: -0.96,
  },
  members: { ...beVietnamPro(14), color: colors.contentM, letterSpacing: -0.6 },
  empty: { paddingHorizontal: spacing.xl },
  dismiss: { position: 'absolute', alignSelf: 'center' },
});
