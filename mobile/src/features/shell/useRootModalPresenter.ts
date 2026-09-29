/**
 * Single app-level root-modal presenter — port of `OnePlanApp.swift:477
 * presentNextRootModalIfNeeded` (+ `checkPendingFriendRequests`), replacing the trip-invite-only
 * `useInvitePresenter`. Mounted once in the tabs layout.
 *
 * Priority (one at a time): free trial → incoming friend request → trip invite. Only real-time
 * arrivals pop up (websocket friend requests, websocket/push invites); fetched backlogs are
 * banner-only. Friend codes
 * are never queued here — `/friend/[code]` is always navigated to directly and claims the
 * root-modal window itself on mount.
 *
 * Presentation state is split on purpose:
 *  - free trial / friend code / friend request live in `rootModalStore.active`, which each modal
 *    claims (friend code) or is given (free trial, friend request) and clears from its unmount
 *    cleanup via `markRootModalDismissed()`;
 *  - trip invites keep their pre-existing state exactly (`pendingInvitesStore.activeCode` +
 *    `presenterState`'s `lastPushedInvite`/`markInvitePresented`), because `/join/[code]` is also
 *    mounted directly by a deep link and already claims/releases `activeCode` itself. A pushed
 *    invite counts as an active root modal so a friend request can't land on top of it.
 */
import { router } from 'expo-router';
import { useEffect } from 'react';

import { useAuthStore } from '@/auth/authStore';
import { useFriendRequests } from '@/features/friends/api/queries';
import {
  firstUnshownRequestId,
  presentedRequests,
  useLiveRequestsStore,
  usePresentedRequestsStore,
} from '@/features/friends/presentedRequests';
import { pendingInvitesStore, usePendingInvitesStore } from '@/features/invite/pendingInvitesStore';
import { lastPushedInvite, markInvitePresented } from '@/features/invite/presenterState';
import {
  markFreeTrialShown,
  useFreeTrialEligibility,
} from '@/features/subscription/useFreeTrialEligibility';
import { useMe } from '@/features/me/useMe';
import { useWeb3Enabled } from '@/features/vault/web3Flag';
import { hasPrivyIds } from '@/features/vault/wallet/walletConfig';
import { hasSeenTripWalletWelcome } from '@/features/vault/tripWalletWelcomeStore';
import { useVersionGateBlocked } from '@/native/versionGate';

import { nextRootModal, setActiveRootModal, useRootModalStore, type RootModal } from './rootModals';

export function useRootModalPresenter(): void {
  const authed = useAuthStore((s) => s.status === 'authed');
  const blocked = useVersionGateBlocked();
  const storeActive = useRootModalStore((s) => s.active);
  const web3Enabled = useWeb3Enabled();
  const me = useMe();
  // Also requires Privy ids: a build without them (dev/local) can never set a wallet up, so the
  // welcome sheet would greet the user with a dead screen.
  const web3WelcomeEligible = web3Enabled && hasPrivyIds() && !hasSeenTripWalletWelcome(
    me.data ? String(me.data.id) : null,
  );
  const freeTrialEligible = useFreeTrialEligibility();
  const presentedIds = usePresentedRequestsStore((s) => s.ids);
  const liveIds = useLiveRequestsStore((s) => s.ids);
  const requests = useFriendRequests();
  const requestData = requests.data;
  const activeCode = usePendingInvitesStore((s) => s.activeCode);
  const queueLength = usePendingInvitesStore((s) => s.queue.length);

  useEffect(() => {
    // A trip invite that has already been pushed occupies the window until `/join/[code]`
    // unmounts and clears `activeCode`.
    const invitePresented = activeCode !== null && lastPushedInvite() === activeCode;
    const active: RootModal | null =
      storeActive ?? (invitePresented ? { kind: 'tripInvite', code: activeCode } : null);

    const decision = nextRootModal({
      authed,
      blocked,
      active,
      web3WelcomeEligible,
      freeTrialEligible,
      firstUnshownRequestId: firstUnshownRequestId(requestData, presentedIds, liveIds),
      nextInviteCode: activeCode,
    });

    if (decision === null) {
      // Idle: mirror the old presenter's tail — forget the last pushed invite and pull the next
      // queued code (which sets `activeCode`, re-running this effect and pushing `/join`).
      if (active === null && activeCode === null && !blocked && authed) {
        markInvitePresented(null);
        if (queueLength > 0) pendingInvitesStore.takeNext();
      }
      return;
    }

    switch (decision.kind) {
      case 'web3Welcome':
        setActiveRootModal(decision);
        router.push('/web3-welcome');
        return;
      case 'freeTrial':
        setActiveRootModal(decision);
        // Never offer the promo more than once per launch (iOS `presentFreeTrialIfEligible`),
        // even if the window is still open when the screen is dismissed.
        markFreeTrialShown();
        router.push('/free-trial');
        return;
      case 'friendRequest':
        setActiveRootModal(decision);
        // Marked here as well as on the modal's mount so one id is never pushed twice.
        presentedRequests.add(decision.id);
        router.push({ pathname: '/friend-request/[id]', params: { id: String(decision.id) } });
        return;
      case 'tripInvite':
        markInvitePresented(decision.code);
        router.push({ pathname: '/join/[code]', params: { code: decision.code } });
        return;
    }
  }, [
    authed,
    blocked,
    storeActive,
    web3WelcomeEligible,
    freeTrialEligible,
    presentedIds,
    liveIds,
    requestData,
    activeCode,
    queueLength,
  ]);
}
