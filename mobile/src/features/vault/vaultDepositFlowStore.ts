/**
 * Live handoff for the deposit receipt screen — port of `VaultDepositFlow`
 * (`ios/OnePlan/OnePlan/View/Vault/VaultDepositResultView.swift`, `origin/feat/web3-version`),
 * an `@Observable` object iOS mutates in place so the receipt updates Processing → Completed
 * without remounting or a new fetch. Route params can't carry a live object across a
 * `router.push`, so this mirrors `@/features/location/locationPickStore.ts`'s "hand off through
 * a store, not route params" convention — except this one updates in place rather than being
 * consumed once, since the receipt screen needs to observe the same flow's status changing.
 */
import { create } from 'zustand';

export type VaultDepositStatus = 'processing' | 'completed';

export interface VaultDepositFlow {
  amountMicro: bigint;
  /** The vault PDA — the deposit destination shown as Recipient. */
  recipient: string;
  status: VaultDepositStatus;
  signature: string;
  date: number;
}

interface VaultDepositFlowState {
  flow: VaultDepositFlow | null;
  start: (flow: Omit<VaultDepositFlow, 'status' | 'signature'>) => void;
  complete: (signature: string) => void;
  clear: () => void;
}

export const useVaultDepositFlowStore = create<VaultDepositFlowState>()((set) => ({
  flow: null,
  start: (flow) => set({ flow: { ...flow, status: 'processing', signature: '' } }),
  complete: (signature) =>
    set((s) => (s.flow ? { flow: { ...s.flow, status: 'completed', signature } } : s)),
  clear: () => set({ flow: null }),
}));

/** Non-hook access for imperative call sites (mutation `onSuccess`, screens outside a component). */
export const vaultDepositFlowStore = {
  start: (flow: Omit<VaultDepositFlow, 'status' | 'signature'>) =>
    useVaultDepositFlowStore.getState().start(flow),
  complete: (signature: string) => useVaultDepositFlowStore.getState().complete(signature),
  clear: () => useVaultDepositFlowStore.getState().clear(),
};
