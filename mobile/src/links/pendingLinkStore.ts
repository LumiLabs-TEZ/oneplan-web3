import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandMMKVStorage } from '@/offline/mmkv';

import type { Link } from './link';

interface PendingLinkState {
  /** One parked destination (last write wins), like the iOS `DeepLinkRouter` queue slots. */
  pending: Link | null;
  set: (link: Link) => void;
  /** Returns and clears the parked link so it is handled exactly once. */
  consume: () => Link | null;
  clear: () => void;
}

/**
 * Persisted so a push tapped while the app was cold-started before auth /
 * the router were ready survives until a screen can consume it.
 */
/**
 * One tap delivers the same URL twice — `+native-intent.ts` and `Linking`'s `url` event both
 * park it. `useUrlListener` only dedupes its own events, so the second park used to land after
 * `useLinkResolver` had already consumed the first and push a second copy of the screen. Ignore a
 * re-park of a link identical to one consumed within this window (in-memory, not persisted).
 */
const REPARK_DEDUPE_MS = 2000;
let lastConsumed: { key: string; at: number } | null = null;

export const usePendingLinkStore = create<PendingLinkState>()(
  persist(
    (set, get) => ({
      pending: null,
      set: (link) => {
        const key = JSON.stringify(link);
        if (
          lastConsumed &&
          lastConsumed.key === key &&
          Date.now() - lastConsumed.at < REPARK_DEDUPE_MS
        )
          return;
        set({ pending: link });
      },
      consume: () => {
        const { pending } = get();
        if (pending) {
          lastConsumed = { key: JSON.stringify(pending), at: Date.now() };
          set({ pending: null });
        }
        return pending;
      },
      clear: () => set({ pending: null }),
    }),
    {
      name: 'oneplan.pendingLink',
      storage: createJSONStorage(() => zustandMMKVStorage),
      partialize: (s) => ({ pending: s.pending }),
    },
  ),
);

/** Non-hook access for listeners and background code. */
export const pendingLinkStore = {
  set: (link: Link) => usePendingLinkStore.getState().set(link),
  consume: () => usePendingLinkStore.getState().consume(),
  peek: () => usePendingLinkStore.getState().pending,
  clear: () => usePendingLinkStore.getState().clear(),
};
