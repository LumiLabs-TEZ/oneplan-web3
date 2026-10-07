import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import React, { type ReactNode } from 'react';

import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';

import { claimFaucet, createSiwsChallenge, linkWalletSiws, useClaimFaucet } from './mwa';

function fakeApi(result: { data?: unknown; error?: unknown; status: number }) {
  const call = jest.fn().mockResolvedValue({ ...result, response: { status: result.status, ok: result.status < 400 } });
  return { POST: call, GET: call } as never;
}

describe('vault mwa api', () => {
  it('createSiwsChallenge returns the server challenge', async () => {
    const data = { input: { domain: 'oneplan.space' }, challengeToken: 't' };
    await expect(createSiwsChallenge(fakeApi({ data, status: 200 }))).resolves.toEqual(data);
  });

  it('linkWalletSiws throws ApiMutationError carrying the 409 code', async () => {
    const api = fakeApi({ error: { code: 'wallet_locked_by_vault' }, status: 409 });
    const err = await linkWalletSiws(
      { challengeToken: 't', address: 'a', signedMessage: 'm', signature: 's' },
      api,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiMutationError);
    expect((err as ApiMutationError).status).toBe(409);
  });

  it('claimFaucet surfaces the cooldown as a 429 ApiMutationError', async () => {
    const err = await claimFaucet(fakeApi({ error: { code: 'faucet_cooldown' }, status: 429 })).catch(
      (e: unknown) => e,
    );
    expect((err as ApiMutationError).status).toBe(429);
  });

  it('useClaimFaucet refreshes the wallet balance and history on success', async () => {
    const client = new QueryClient({
      defaultOptions: { mutations: { gcTime: 0 }, queries: { retry: false } },
    });
    const spy = jest.spyOn(client, 'invalidateQueries');
    const api = fakeApi({ data: { signature: 'sig', amountMicro: '5000000' }, status: 201 });
    const wrapper = ({ children }: { children: ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);
    const { result } = await renderHook(() => useClaimFaucet(api), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    // The claim is a transfer into the wallet, so it is a new history row as well as a balance.
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual([
      keys.wallet.balance,
      keys.wallet.history,
    ]);
    client.clear();
  });
});
