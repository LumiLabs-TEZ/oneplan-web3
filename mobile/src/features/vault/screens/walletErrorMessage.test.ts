import type { TFunction } from 'i18next';

import { ApiMutationError } from '@/api/mutationError';

import { VaultPayError } from '../api/pay';
import { WalletError } from '../wallet/walletError';
import { walletErrorMessage } from './walletErrorMessage';

const t = ((key: string, opts?: { 0?: string }) =>
  key.replace('%@', opts?.[0] ?? '')) as unknown as TFunction;

describe('walletErrorMessage', () => {
  it('translates a WalletError instead of exposing its kind', () => {
    expect(walletErrorMessage(t, WalletError.sessionNotReady())).toBe(
      'Wallet session is not ready yet. Please try again in a moment.',
    );
  });

  it('fills the reason into the message', () => {
    expect(walletErrorMessage(t, WalletError.sessionFailed('HTTP 503'))).toBe(
      'Could not reach the wallet service: HTTP 503',
    );
  });

  it('renders the wallet timeout message', () => {
    expect(walletErrorMessage(t, WalletError.walletTimedOut())).toBe(
      'Your wallet took too long to respond. Go back to OnePlan and try again.',
    );
  });

  it('returns null for non-wallet errors so the caller falls back', () => {
    expect(walletErrorMessage(t, new Error('boom'))).toBeNull();
  });

  describe('409 tx_expired (blockhash expired during a slow wallet approval)', () => {
    const expiredBody = { code: 'tx_expired', message: 'This transaction expired before it was sent.' };
    const readable = 'That took too long in your wallet. Please try again.';

    it('explains it for a deposit/withdraw ApiMutationError', () => {
      expect(walletErrorMessage(t, new ApiMutationError(409, expiredBody))).toBe(readable);
    });

    it('explains it for a pay/approve VaultPayError', () => {
      expect(walletErrorMessage(t, new VaultPayError(409, expiredBody))).toBe(readable);
    });

    it('leaves any other 409 to the caller', () => {
      expect(
        walletErrorMessage(t, new ApiMutationError(409, { code: 'wallet_locked_by_vault' })),
      ).toBeNull();
    });
  });
});
