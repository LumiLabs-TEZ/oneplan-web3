/**
 * One-shot toast text for `TripVaultSection` — port of `TripVaultSection.announce(_:)`
 * (`origin/feat/web3-version`). The pay flow runs on its own route above the trip screen, so when
 * a payment ends as "pending" / "awaiting approval" it hands the sentence to the card through this
 * store (same "hand off through a store, not route params" convention as
 * `vaultDepositFlowStore.ts`), and the card shows it as a banner once it is back on top.
 */
import { create } from 'zustand';

interface VaultAnnounceState {
  message: string | null;
  announce: (message: string) => void;
  clear: () => void;
}

export const useVaultAnnounceStore = create<VaultAnnounceState>()((set) => ({
  message: null,
  announce: (message) => set({ message }),
  clear: () => set({ message: null }),
}));
