import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import React from 'react';

import { createApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';

import {
  buildVaultDeposit,
  createVault,
  linkVaultWallet,
  linkWallet,
  submitVaultDeposit,
  syncVaultMembers,
  updateVaultSpend,
  useBuildVaultDeposit,
  useCreateVault,
  useLinkVaultWallet,
  useLinkWallet,
  useSubmitVaultDeposit,
  useUpdateVaultSpend,
} from './mutations';
import {
  fetchMyVaultWallet,
  fetchVaultBalance,
  fetchVaultHistory,
  fetchVaultSettlement,
  fetchVaultTransaction,
  fetchWallet,
  fetchWalletHistory,
  useVaultBalance,
  useVaultTransaction,
} from './queries';

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function wrapper(client: QueryClient) {
  function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  }
  return Wrapper;
}

describe('vault reads', () => {
  it('fetchVaultBalance GETs the balance path', async () => {
    const calls: Request[] = [];
    const balance = {
      vaultPda: 'pda',
      usdcAta: 'ata',
      treasuryAta: 'treasury',
      balanceMicro: '1000000',
      thresholdMicro: '3000000',
      dailyLimitMicro: '100000000',
    };
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json(balance);
      }),
    );
    await expect(fetchVaultBalance(5, api)).resolves.toEqual(balance);
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/vault/balance');
  });

  it('fetchVaultBalance throws HttpError on a non-ok response', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => new Response(null, { status: 403 })),
    );
    await expect(fetchVaultBalance(5, api)).rejects.toThrow(/403/);
  });

  it('fetchMyVaultWallet GETs the trip-scoped wallet path', async () => {
    const calls: Request[] = [];
    const wallet = { publicKey: 'abc', usdcAta: 'ata', balanceMicro: '500000' };
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json(wallet);
      }),
    );
    await expect(fetchMyVaultWallet(5, api)).resolves.toEqual(wallet);
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/vault/wallet');
  });

  it('fetchVaultHistory GETs the history path', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json([]);
      }),
    );
    await expect(fetchVaultHistory(5, api)).resolves.toEqual([]);
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/vault/history');
  });

  it('fetchVaultSettlement GETs the settlement preview path', async () => {
    const calls: Request[] = [];
    const preview = {
      balanceMicro: '0',
      totalOnChainMicro: '0',
      totalOffChainMicro: '0',
      payouts: [],
      canSettle: true,
      isSettled: false,
      cashDebts: [],
    };
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json(preview);
      }),
    );
    await expect(fetchVaultSettlement(5, api)).resolves.toEqual(preview);
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/vault/settlement');
  });

  it('fetchWallet GETs the account-wide personal wallet', async () => {
    const calls: Request[] = [];
    const wallet = { publicKey: null, usdcAta: null, balanceMicro: '0' };
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json(wallet);
      }),
    );
    await expect(fetchWallet(api)).resolves.toEqual(wallet);
    expect(new URL(calls[0]!.url).pathname).toBe('/wallet');
  });

  it('fetchWalletHistory GETs the account-wide history', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json([]);
      }),
    );
    await expect(fetchWalletHistory(api)).resolves.toEqual([]);
    expect(new URL(calls[0]!.url).pathname).toBe('/wallet/history');
  });

  it('useVaultBalance is disabled for a non-positive tripId', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = await renderHook(() => useVaultBalance(0), {
      wrapper: wrapper(client),
    });
    expect(result.current.fetchStatus).toBe('idle');
    client.clear();
  });

  it('useVaultBalance never fetches when opts.enabled is explicitly false — the trip-detail screen relies on this to keep HomeCard unchanged when useWeb3Enabled() is off', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = await renderHook(() => useVaultBalance(5, { enabled: false }), {
      wrapper: wrapper(client),
    });
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.isSuccess).toBe(false);
    client.clear();
  });
});

describe('createVault', () => {
  it('POSTs thresholds and invalidates the balance cache', async () => {
    const created = { vaultPda: 'pda', usdcAta: 'ata', membersSynced: 2 };
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json(created, 201);
      }),
    );
    await expect(
      createVault(5, { thresholdMicro: '3000000', dailyLimitMicro: '100000000' }, api),
    ).resolves.toEqual(created);
    expect(calls[0]?.method).toBe('POST');
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/vault');
  });

  it('wraps a failure in ApiMutationError', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'nope' }, 403)),
    );
    await expect(
      createVault(5, { thresholdMicro: '3000000', dailyLimitMicro: '100000000' }, api),
    ).rejects.toBeInstanceOf(ApiMutationError);
  });

  it('useCreateVault invalidates vault.balance on success', async () => {
    const client = new QueryClient({
      defaultOptions: { mutations: { gcTime: 0 }, queries: { retry: false } },
    });
    const spy = jest.spyOn(client, 'invalidateQueries');
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ vaultPda: 'pda', usdcAta: 'ata', membersSynced: 0 }, 201)),
    );
    const { result } = await renderHook(() => useCreateVault(5, api), { wrapper: wrapper(client) });
    await act(async () => {
      await result.current.mutateAsync({ thresholdMicro: '3000000', dailyLimitMicro: '100000000' });
    });
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual([keys.vault.balance(5)]);
    client.clear();
  });
});

describe('syncVaultMembers', () => {
  it('POSTs to members/sync', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ added: 3 }, 201);
      }),
    );
    await expect(syncVaultMembers(5, api)).resolves.toEqual({ added: 3 });
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/vault/members/sync');
  });
});

describe('linkVaultWallet / linkWallet', () => {
  it('linkVaultWallet POSTs the public key to the trip-scoped path', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ publicKey: 'abc' }, 201);
      }),
    );
    await expect(linkVaultWallet(5, { publicKey: 'abc' }, api)).resolves.toEqual({
      publicKey: 'abc',
    });
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/vault/wallet');
    expect(await calls[0]!.json()).toEqual({ publicKey: 'abc' });
  });

  it('linkWallet POSTs the public key to the account-wide path', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ publicKey: 'abc' }, 201);
      }),
    );
    await expect(linkWallet({ publicKey: 'abc' }, api)).resolves.toEqual({ publicKey: 'abc' });
    expect(new URL(calls[0]!.url).pathname).toBe('/wallet/link');
  });

  it('useLinkVaultWallet invalidates myWallet and balance on success', async () => {
    const client = new QueryClient({
      defaultOptions: { mutations: { gcTime: 0 }, queries: { retry: false } },
    });
    const spy = jest.spyOn(client, 'invalidateQueries');
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ publicKey: 'abc' }, 201)),
    );
    const { result } = await renderHook(() => useLinkVaultWallet(5, api), {
      wrapper: wrapper(client),
    });
    await act(async () => {
      await result.current.mutateAsync({ publicKey: 'abc' });
    });
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual([
      keys.vault.myWallet(5),
      keys.vault.balance(5),
    ]);
    client.clear();
  });

  it('useLinkWallet invalidates the account-wide wallet balance', async () => {
    const client = new QueryClient({
      defaultOptions: { mutations: { gcTime: 0 }, queries: { retry: false } },
    });
    const spy = jest.spyOn(client, 'invalidateQueries');
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ publicKey: 'abc' }, 201)),
    );
    const { result } = await renderHook(() => useLinkWallet(api), { wrapper: wrapper(client) });
    await act(async () => {
      await result.current.mutateAsync({ publicKey: 'abc' });
    });
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual([keys.wallet.balance]);
    client.clear();
  });
});

describe('deposit build + submit', () => {
  it('buildVaultDeposit POSTs the amount and returns an unsigned tx', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ base64Tx: 'BASE64' }, 201);
      }),
    );
    await expect(buildVaultDeposit(5, { amountMicro: '1000000' }, api)).resolves.toEqual({
      base64Tx: 'BASE64',
    });
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/vault/deposit');
    expect(await calls[0]!.json()).toEqual({ amountMicro: '1000000' });
  });

  it('submitVaultDeposit POSTs the signed tx and returns the signature', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ signature: 'SIG' }, 201);
      }),
    );
    await expect(
      submitVaultDeposit(5, { signedTx: 'BASE64', amountMicro: '1000000' }, api),
    ).resolves.toEqual({ signature: 'SIG' });
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/vault/deposit/submit');
  });

  it('useBuildVaultDeposit does not invalidate any cache (build only, no money moved)', async () => {
    const client = new QueryClient({
      defaultOptions: { mutations: { gcTime: 0 }, queries: { retry: false } },
    });
    const spy = jest.spyOn(client, 'invalidateQueries');
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ base64Tx: 'BASE64' }, 201)),
    );
    const { result } = await renderHook(() => useBuildVaultDeposit(5, api), {
      wrapper: wrapper(client),
    });
    await act(async () => {
      await result.current.mutateAsync({ amountMicro: '1000000' });
    });
    expect(spy).not.toHaveBeenCalled();
    client.clear();
  });

  it('useSubmitVaultDeposit invalidates vault + personal wallet caches on success', async () => {
    const client = new QueryClient({
      defaultOptions: { mutations: { gcTime: 0 }, queries: { retry: false } },
    });
    const spy = jest.spyOn(client, 'invalidateQueries');
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ signature: 'SIG' }, 201)),
    );
    const { result } = await renderHook(() => useSubmitVaultDeposit(5, api), {
      wrapper: wrapper(client),
    });
    await act(async () => {
      await result.current.mutateAsync({ signedTx: 'BASE64', amountMicro: '1000000' });
    });
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual([
      keys.vault.balance(5),
      keys.vault.history(5),
      keys.vault.myWallet(5),
      keys.wallet.balance,
      keys.wallet.history,
    ]);
    client.clear();
  });

  it('submitVaultDeposit wraps a failure in ApiMutationError', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'insufficient funds' }, 400)),
    );
    await expect(
      submitVaultDeposit(5, { signedTx: 'BASE64', amountMicro: '1000000' }, api),
    ).rejects.toBeInstanceOf(ApiMutationError);
  });
});

const transactionDetail = {
  id: 42,
  status: 'CONFIRMED',
  needsApproval: false,
  canApprove: false,
  canCancel: false,
  canEdit: true,
  amountVnd: '200000',
  amountUsdcMicro: '7660000',
  recipientName: 'Nguyen Van A',
  bankName: 'Techcombank',
  bankAccountNumber: '0271003061328',
  feeMicro: '57450',
  rate: '26500',
  name: 'Cafe',
  shareWith: [],
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('fetchVaultTransaction / useVaultTransaction', () => {
  it('GETs the transaction detail path', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json(transactionDetail);
      }),
    );
    await expect(fetchVaultTransaction(5, 42, api)).resolves.toEqual(transactionDetail);
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/vault/pay/42');
  });

  it('fetchVaultTransaction throws HttpError on a non-ok response', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => new Response(null, { status: 404 })),
    );
    await expect(fetchVaultTransaction(5, 42, api)).rejects.toThrow(/404/);
  });

  it('useVaultTransaction is disabled when vaultTransactionId is null', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = await renderHook(() => useVaultTransaction(5, null), {
      wrapper: wrapper(client),
    });
    expect(result.current.fetchStatus).toBe('idle');
    client.clear();
  });
});

describe('updateVaultSpend / useUpdateVaultSpend', () => {
  it('PATCHes name/category/shareWithUserIds to the transaction path', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ ...transactionDetail, name: 'Coffee run' });
      }),
    );
    await expect(
      updateVaultSpend(
        5,
        42,
        { name: 'Coffee run', category: 'COFFEE', shareWithUserIds: [1, 2] },
        api,
      ),
    ).resolves.toEqual({ ...transactionDetail, name: 'Coffee run' });
    expect(calls[0]?.method).toBe('PATCH');
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/vault/pay/42');
    expect(await calls[0]!.json()).toEqual({
      name: 'Coffee run',
      category: 'COFFEE',
      shareWithUserIds: [1, 2],
    });
  });

  it('wraps a failure in ApiMutationError', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'trip ended' }, 400)),
    );
    await expect(updateVaultSpend(5, 42, { name: 'x' }, api)).rejects.toBeInstanceOf(
      ApiMutationError,
    );
  });

  it('useUpdateVaultSpend invalidates the transaction detail and history caches', async () => {
    const client = new QueryClient({
      defaultOptions: { mutations: { gcTime: 0 }, queries: { retry: false } },
    });
    const spy = jest.spyOn(client, 'invalidateQueries');
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json(transactionDetail)),
    );
    const { result } = await renderHook(() => useUpdateVaultSpend(5, 42, api), {
      wrapper: wrapper(client),
    });
    await act(async () => {
      await result.current.mutateAsync({ name: 'Coffee run' });
    });
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual([
      keys.vault.transaction(5, 42),
      keys.vault.history(5),
    ]);
    client.clear();
  });
});
