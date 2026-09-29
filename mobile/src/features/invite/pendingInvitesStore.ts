/**
 * Pending trip-invite queue (`Services/RealtimeService.swift:149-227,713-748`).
 * Invites arrive from three places — the websocket (`tripInviteReceived`), the
 * pending-invites REST fetch (`GET /trips/invites/pending`), and eventually a
 * push tap — and are deduped by `inviteCode` into one list. `queue` is the
 * auto-presentation order for the full-screen invite sheet (wired in M2.5);
 * `activeCode` is which one (if any) is currently presented.
 *
 * Only real-time arrivals (`POPUP_SOURCES`) are queued for the popup. Invites
 * fetched on launch/foreground, or received while the app was closed, live in the
 * Home banner stack only — otherwise a backlog meant clicking through one popup
 * per invite on every open.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandMMKVStorage } from '@/offline/mmkv';

import type { PendingInvite } from './types';

export type InviteSource = 'websocket' | 'deepLink' | 'api' | 'push';

/** Sources that auto-present the invite popup. A deep link presents itself directly. */
const POPUP_SOURCES: ReadonlySet<InviteSource> = new Set(['websocket', 'push']);

interface PendingInvitesState {
  invites: PendingInvite[];
  queue: string[];
  activeCode: string | null;
  /**
   * Upsert by `inviteCode`. Real-time sources also enqueue the code for the popup unless it is
   * already queued or active; `'api'` / `'deepLink'` upserts are banner-only.
   */
  upsert: (invite: PendingInvite, source: InviteSource) => void;
  /** Removes the invite entirely (accepted/declined) and clears it if presented. */
  resolve: (inviteCode: string) => void;
  /** Closes the presentation only — the invite stays in `invites` (banner stays). */
  dismissActive: () => void;
  /** Banner "View": presents `inviteCode` directly. */
  present: (inviteCode: string) => void;
  /** Pops `queue` until a still-pending code is found, presents it, and returns it. */
  takeNext: () => string | null;
  reset: () => void;
}

interface PersistedShape {
  invites: PendingInvite[];
  queue: string[];
  activeCode: string | null;
}

/**
 * A deep-link upsert only knows the trip (no inviter, maybe no cover), so empty fields must
 * not wipe what the websocket / pending-invites fetch already told us.
 */
function mergeInvite(existing: PendingInvite, incoming: PendingInvite): PendingInvite {
  return {
    ...incoming,
    coverImageUrl: incoming.coverImageUrl || existing.coverImageUrl,
    invitedByDisplayName: incoming.invitedByDisplayName || existing.invitedByDisplayName,
  };
}

/**
 * Codes whose decline PATCH is in flight. A foreground `'api'` sync racing the PATCH would
 * otherwise re-add the invite the user just trashed; a websocket re-invite still gets through.
 */
const declining = new Set<string>();

const INITIAL: PersistedShape = { invites: [], queue: [], activeCode: null };

export const usePendingInvitesStore = create<PendingInvitesState>()(
  persist(
    (set, get) => ({
      ...INITIAL,
      upsert: (invite, source) => {
        if (source === 'api' && declining.has(invite.inviteCode)) return;
        const { invites, queue, activeCode } = get();
        const index = invites.findIndex((i) => i.inviteCode === invite.inviteCode);
        const nextInvites =
          index === -1
            ? [...invites, invite]
            : invites.map((i, idx) => (idx === index ? mergeInvite(i, invite) : i));
        const alreadyTracked =
          queue.includes(invite.inviteCode) || activeCode === invite.inviteCode;
        const nextQueue =
          alreadyTracked || !POPUP_SOURCES.has(source) ? queue : [...queue, invite.inviteCode];
        set({ invites: nextInvites, queue: nextQueue });
      },
      resolve: (inviteCode) => {
        const { invites, queue, activeCode } = get();
        set({
          invites: invites.filter((i) => i.inviteCode !== inviteCode),
          queue: queue.filter((code) => code !== inviteCode),
          activeCode: activeCode === inviteCode ? null : activeCode,
        });
      },
      dismissActive: () => set({ activeCode: null }),
      present: (inviteCode) => set({ activeCode: inviteCode }),
      takeNext: () => {
        const { invites } = get();
        let { queue } = get();
        while (queue.length > 0) {
          const [next, ...rest] = queue as [string, ...string[]];
          queue = rest;
          if (invites.some((i) => i.inviteCode === next)) {
            set({ queue, activeCode: next });
            return next;
          }
        }
        set({ queue });
        return null;
      },
      reset: () => set({ ...INITIAL }),
    }),
    {
      name: 'oneplan.pendingTripInvites',
      storage: createJSONStorage(() => zustandMMKVStorage),
      partialize: (s) => ({ invites: s.invites }),
    },
  ),
);

/** Non-hook access for the realtime bridge, sync hook, and sign-out. */
export const pendingInvitesStore = {
  upsert: (invite: PendingInvite, source: InviteSource) =>
    usePendingInvitesStore.getState().upsert(invite, source),
  resolve: (inviteCode: string) => usePendingInvitesStore.getState().resolve(inviteCode),
  /** Optimistic trash: drops the invite and shields it from `'api'` re-adds until settled. */
  decline: (inviteCode: string) => {
    declining.add(inviteCode);
    usePendingInvitesStore.getState().resolve(inviteCode);
  },
  declineSettled: (inviteCode: string) => {
    declining.delete(inviteCode);
  },
  /** Decline PATCH failed: bring the invite back so the user can retry. */
  declineFailed: (invite: PendingInvite) => {
    declining.delete(invite.inviteCode);
    usePendingInvitesStore.getState().upsert(invite, 'api');
  },
  present: (inviteCode: string) => usePendingInvitesStore.getState().present(inviteCode),
  takeNext: () => usePendingInvitesStore.getState().takeNext(),
  dismissActive: () => usePendingInvitesStore.getState().dismissActive(),
  peekActive: () => usePendingInvitesStore.getState().activeCode,
  reset: () => {
    declining.clear();
    usePendingInvitesStore.getState().reset();
  },
};
