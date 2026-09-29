/**
 * Port of `TripWalletWelcomeManager.swift` (`origin/feat/web3-version`) — trip-wallet welcome
 * presentation, once per signed-in user. iOS persists a `tripWalletWelcome.seen.<userId>`
 * UserDefaults boolean; this keys a persisted array by userId the same way (mirrors
 * `@/stores/settingsStore.ts`'s zustandMMKVStorage pattern) so switching accounts on one device
 * doesn't suppress the welcome for a second user.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { zustandMMKVStorage } from '@/offline/mmkv';

export const TRIP_WALLET_WELCOME_STORAGE_KEY = 'oneplan.tripWalletWelcome';

interface TripWalletWelcomeState {
  seenUserIds: string[];
  markSeen: (userId: string) => void;
}

export const useTripWalletWelcomeStore = create<TripWalletWelcomeState>()(
  persist(
    (set, get) => ({
      seenUserIds: [],
      markSeen: (userId) => {
        if (get().seenUserIds.includes(userId)) return;
        set({ seenUserIds: [...get().seenUserIds, userId] });
      },
    }),
    {
      name: TRIP_WALLET_WELCOME_STORAGE_KEY,
      storage: createJSONStorage(() => zustandMMKVStorage),
    },
  ),
);

/**
 * Whether `userId` should still see the welcome sheet. `null`/empty userId (not yet resolved)
 * never counts as seen — mirrors Swift's `guard let userId, !userId.isEmpty`.
 */
export function hasSeenTripWalletWelcome(userId: string | null | undefined): boolean {
  if (!userId) return true;
  return useTripWalletWelcomeStore.getState().seenUserIds.includes(userId);
}

/** Continue, Close, and "Add money" all count as seen — any dismiss marks it done. */
export function markTripWalletWelcomeSeen(userId: string | null | undefined): void {
  if (!userId) return;
  useTripWalletWelcomeStore.getState().markSeen(userId);
}
