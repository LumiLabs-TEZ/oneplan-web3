/**
 * Bookkeeping for the two friend root modals.
 *
 * `presentedRequests` is the "already auto-presented" set behind
 * `OnePlanApp.checkPendingFriendRequests` (`OnePlanApp.swift:363-375`). Unlike iOS it is persisted
 * (MMKV), so a request the user closed does not pop up again on every relaunch — the Home
 * `FriendRequestBanner` keeps it reachable until it is accepted or declined. Requests themselves
 * are still re-fetched via `useFriendRequests`; only never-seen ids auto-present. Cleared on
 * sign-out by `resetRootModalPresenter`.
 *
 * It is a zustand store rather than a bare `Set` module so `useRootModalPresenter`'s single
 * effect re-evaluates when an id is marked — the ids the presenter reads are otherwise invisible
 * to React and the next queued modal would stall until some unrelated store changed.
 *
 * Only requests received over the websocket this session (`liveRequests`) auto-present; ones
 * that were merely fetched (sent while the app was closed) stay banner-only, so a backlog never
 * turns into a click-through chain of popups on launch.
 *
 * Friend codes are deliberately NOT queued here: a `oneplan://friend/{code}` link, a QR scan and
 * the Members "Add" row all navigate straight to `/friend/[code]` (`hrefForLink`), and that
 * screen claims the root-modal window itself on mount.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandMMKVStorage } from '@/offline/mmkv';

/** Most recent ids kept; old requests are long resolved, so the set can't grow forever. */
const MAX_IDS = 200;

interface PresentedRequestsState {
  /** Insertion-ordered ids; a plain array so store subscribers see a new identity per change. */
  ids: readonly number[];
  add: (id: number) => void;
  reset: () => void;
}

export const usePresentedRequestsStore = create<PresentedRequestsState>()(
  persist(
    (set, get) => ({
      ids: [],
      add: (id) => {
        if (get().ids.includes(id)) return;
        set({ ids: [...get().ids, id].slice(-MAX_IDS) });
      },
      reset: () => set({ ids: [] }),
    }),
    {
      name: 'oneplan.presentedFriendRequests',
      storage: createJSONStorage(() => zustandMMKVStorage),
      partialize: (s) => ({ ids: s.ids }),
    },
  ),
);

interface LiveRequestsState {
  ids: readonly number[];
  add: (id: number) => void;
  reset: () => void;
}

/** Request ids received over the websocket this session. Not persisted — "live" means now. */
export const useLiveRequestsStore = create<LiveRequestsState>()((set, get) => ({
  ids: [],
  add: (id) => {
    if (get().ids.includes(id)) return;
    set({ ids: [...get().ids, id].slice(-MAX_IDS) });
  },
  reset: () => set({ ids: [] }),
}));

export const liveRequests = {
  add: (id: number) => useLiveRequestsStore.getState().add(id),
  ids: () => useLiveRequestsStore.getState().ids,
  reset: () => useLiveRequestsStore.getState().reset(),
};

/** Non-hook access for the presenter and the receive modal. */
export const presentedRequests = {
  add: (id: number) => usePresentedRequestsStore.getState().add(id),
  has: (id: number) => usePresentedRequestsStore.getState().ids.includes(id),
  reset: () => usePresentedRequestsStore.getState().reset(),
};

/** First live (websocket-received) request id that has not been auto-presented yet, or `null`. */
export function firstUnshownRequestId(
  requests: readonly { id: number }[] | undefined,
  presentedIds: readonly number[],
  liveIds: readonly number[],
): number | null {
  const next = requests?.find((r) => liveIds.includes(r.id) && !presentedIds.includes(r.id));
  return next ? next.id : null;
}
