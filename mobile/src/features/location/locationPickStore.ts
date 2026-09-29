/**
 * One-shot handoff for a place picked in the location-search sheet (or map tap) back to
 * whichever screen opened it. Mirrors the "result then consume" pattern used by native
 * pickers that return through a callback rather than route params: the picker screen calls
 * `set()` before navigating back, the waiting screen calls `consume()` once on focus, which
 * both reads and clears the slot so a stale pick never re-applies on a later re-mount.
 */
import { create } from 'zustand';

import type { LocationPick } from './types';

interface LocationPickState {
  result: LocationPick | null;
  set: (result: LocationPick) => void;
  consume: () => LocationPick | null;
}

export const useLocationPickStore = create<LocationPickState>()((set, get) => ({
  result: null,
  set: (result) => set({ result }),
  consume: () => {
    const current = get().result;
    if (current !== null) set({ result: null });
    return current;
  },
}));

/** Non-hook access for imperative call sites (route handlers, screens outside a component). */
export const locationPickStore = {
  set: (result: LocationPick) => useLocationPickStore.getState().set(result),
  consume: () => useLocationPickStore.getState().consume(),
};
