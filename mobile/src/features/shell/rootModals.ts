/**
 * Which root modal (if any) the app should present next — pure port of
 * `OnePlanApp.swift:477 presentNextRootModalIfNeeded` and the queue semantics prose in
 * `android/.../social/SocialPresentationCoordinator.kt:21-58`.
 *
 * One at a time, in priority order: web3 trip-wallet welcome → free trial → incoming friend
 * request → trip invite (iOS's `presentTripWalletWelcomeIfNeeded` runs ahead of
 * `presentFreeTrialIfEligible` too). Nothing presents behind the forced-update wall, while
 * signed out, or while another root modal is already up.
 *
 * `'friendCode'` is a `RootModal` kind but never a *decision*: friend codes always navigate
 * directly (deep link, QR scan, Members "Add"), and `/friend/[code]` claims the window itself on
 * mount so nothing else can land on top of it.
 */
import { create } from 'zustand';

import { liveRequests, presentedRequests } from '@/features/friends/presentedRequests';
import { markInvitePresented } from '@/features/invite/presenterState';

export type RootModal =
  | { kind: 'web3Welcome' }
  | { kind: 'freeTrial' }
  | { kind: 'friendCode'; code: string }
  | { kind: 'friendRequest'; id: number }
  | { kind: 'tripInvite'; code: string };

export interface RootModalInputs {
  authed: boolean;
  /** Version gate (`useVersionGateBlocked`) — the forced-update screen owns the window. */
  blocked: boolean;
  /** The modal currently presented, or `null`. */
  active: RootModal | null;
  /** `useWeb3Enabled() && !hasSeenTripWalletWelcome(userId)`. */
  web3WelcomeEligible: boolean;
  freeTrialEligible: boolean;
  /** First websocket-received request id not yet shown (`checkPendingFriendRequests`). */
  firstUnshownRequestId: number | null;
  /** Presented-or-queued trip invite code (`RealtimeService.activeTripInvitePresentation`). */
  nextInviteCode: string | null;
}

export function nextRootModal(i: RootModalInputs): RootModal | null {
  if (!i.authed || i.blocked || i.active !== null) return null;
  if (i.web3WelcomeEligible) return { kind: 'web3Welcome' };
  if (i.freeTrialEligible) return { kind: 'freeTrial' };
  // By design an unshown friend request pre-empts a queued/banner-initiated trip invite — the
  // iOS (`presentNextRootModalIfNeeded`) and Android (`SocialPresentationCoordinator`) priority
  // tables both put social requests ahead of invites.
  if (i.firstUnshownRequestId !== null) {
    return { kind: 'friendRequest', id: i.firstUnshownRequestId };
  }
  if (i.nextInviteCode) return { kind: 'tripInvite', code: i.nextInviteCode };
  return null;
}

interface RootModalState {
  active: RootModal | null;
  set: (modal: RootModal | null) => void;
}

/**
 * Which modal is on screen. A store (not a bare module variable like `presenterState`) so the
 * presenter's effect re-runs when a modal is dismissed and the next queued one can present.
 *
 * Lives here rather than in `useRootModalPresenter` so sign-out can reset it without pulling
 * `expo-router` (and the whole native stack) into non-UI code.
 */
export const useRootModalStore = create<RootModalState>()((set) => ({
  active: null,
  set: (modal) => set({ active: modal }),
}));

export function useActiveRootModal(): RootModal | null {
  return useRootModalStore((s) => s.active);
}

export function activeRootModal(): RootModal | null {
  return useRootModalStore.getState().active;
}

export function setActiveRootModal(modal: RootModal | null): void {
  useRootModalStore.getState().set(modal);
}

/**
 * Called from each root modal's unmount cleanup so the next queued one can present.
 *
 * `expected` guards against a modal clearing someone else's window: a deep link can push
 * `/friend/[code]` on top of a live `/friend-request/[id]`, and when the top one closes the
 * request underneath is still the active root modal. Callers pass their own kind; no argument
 * keeps the old unconditional behaviour (M5.4's free-trial screen still uses that form).
 */
export function markRootModalDismissed(expected?: RootModal['kind']): void {
  if (expected !== undefined && activeRootModal()?.kind !== expected) return;
  useRootModalStore.getState().set(null);
}

/** Sign-out / test helper: forget everything presented this session. */
export function resetRootModalPresenter(): void {
  setActiveRootModal(null);
  presentedRequests.reset();
  liveRequests.reset();
  markInvitePresented(null);
}
