import { onlineManager } from '@tanstack/react-query';
import { create } from 'zustand';

/**
 * Dev-only "force offline" switch for e2e runs. The iOS simulator shares the Mac's network, so
 * there is no way to flip NetInfo from a Maestro flow; `(dev)/offline` toggles this store instead.
 * `computeOnline` is the single place that combines NetInfo with the override — the root layout's
 * `onlineManager` listener goes through it, and flipping the store re-applies the result.
 */
interface DevOfflineState {
  forced: boolean;
  setForced: (forced: boolean) => void;
}

export const useDevOfflineStore = create<DevOfflineState>()((set) => ({
  forced: false,
  setForced: (forced) => set({ forced }),
}));

let lastNetInfoOnline = true;

export function computeOnline(netInfoOnline: boolean): boolean {
  lastNetInfoOnline = netInfoOnline;
  return netInfoOnline && !useDevOfflineStore.getState().forced;
}

/** Re-applies the combined state whenever the override flips. Returns the unsubscribe. */
export function installDevOfflineOverride(): () => void {
  return useDevOfflineStore.subscribe((state, prev) => {
    if (state.forced === prev.forced) return;
    onlineManager.setOnline(computeOnline(lastNetInfoOnline));
  });
}
