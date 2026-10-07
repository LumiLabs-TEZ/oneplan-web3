/**
 * Hands the withdraw outcome from the sheet to the full-screen result route
 * (`src/app/wallet/withdraw-result.tsx`) — a `bigint` + `Date` don't survive route params, same
 * reason `vaultDepositFlowStore` exists. `sendAgainRequested` is the result's "Send again": the
 * withdraw sheet host reopens the form when it sees it.
 */
import { create } from 'zustand';

import type { WalletWithdrawResult } from './screens/WalletWithdrawResultScreen';

interface WalletWithdrawResultState {
  result: WalletWithdrawResult | null;
  setResult: (result: WalletWithdrawResult) => void;
  sendAgainRequested: boolean;
  requestSendAgain: () => void;
  consumeSendAgain: () => void;
}

export const useWalletWithdrawResultStore = create<WalletWithdrawResultState>()((set) => ({
  result: null,
  setResult: (result) => set({ result }),
  sendAgainRequested: false,
  requestSendAgain: () => set({ sendAgainRequested: true }),
  consumeSendAgain: () => set({ sendAgainRequested: false }),
}));
