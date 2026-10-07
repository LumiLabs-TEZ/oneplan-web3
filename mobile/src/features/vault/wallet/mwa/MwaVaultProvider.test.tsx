import { act, render, waitFor } from '@testing-library/react-native';

import { useWeb3Enabled } from '../../web3Flag';
import {
  _resetWalletHandleForTests,
  connectedVaultWalletAddress,
  connectVaultWallet,
  ensureVaultWallet,
  isVaultWalletConfigured,
  resetVaultWallet,
  signVaultTransaction,
  vaultWalletKind,
} from '../walletHandle';
import { MWA_WALLET_TIMEOUT_MS } from '../walletTimeout';
import {
  connectMwaWallet,
  disconnectMwaWallet,
  loadMwaConnection,
  signWithMwa,
} from './mwaSession';
import { MwaVaultProvider } from './MwaVaultProvider';

jest.mock('../../web3Flag', () => ({ useWeb3Enabled: jest.fn() }));
const mockMe = jest.fn();
jest.mock('@/features/me/useMe', () => ({ useMe: () => mockMe() }));
jest.mock('./mwaSession', () => ({
  loadMwaConnection: jest.fn(),
  connectMwaWallet: jest.fn(),
  signWithMwa: jest.fn(),
  disconnectMwaWallet: jest.fn(async () => undefined),
}));

beforeEach(() => {
  jest.clearAllMocks();
  _resetWalletHandleForTests();
  jest.mocked(useWeb3Enabled).mockReturnValue(true);
  mockMe.mockReturnValue({ data: { id: 7 } });
});

it('publishes an mwa handle that reports the cached connection', async () => {
  jest
    .mocked(loadMwaConnection)
    .mockResolvedValue({ address: 'Addr1', authToken: 't', walletUriBase: 'w' });
  await render(<MwaVaultProvider />);
  await waitFor(() => expect(connectedVaultWalletAddress()).toBe('Addr1'));
  expect(vaultWalletKind()).toBe('mwa');
  await expect(ensureVaultWallet()).resolves.toBe('Addr1');
  expect(connectMwaWallet).not.toHaveBeenCalled();
});

it('ensureWallet connects interactively when nothing is cached', async () => {
  jest.mocked(loadMwaConnection).mockResolvedValue(null);
  jest
    .mocked(connectMwaWallet)
    .mockResolvedValue({ address: 'Addr2', authToken: 't', walletUriBase: 'w' });
  await render(<MwaVaultProvider />);
  await waitFor(() => expect(vaultWalletKind()).toBe('mwa'));
  await act(async () => {
    await expect(ensureVaultWallet()).resolves.toBe('Addr2');
  });
  expect(connectMwaWallet).toHaveBeenCalledWith(7, { isCurrent: expect.any(Function) });
  await waitFor(() => expect(connectedVaultWalletAddress()).toBe('Addr2'));
});

it('connect always opens the wallet and propagates its errors unchanged', async () => {
  jest
    .mocked(loadMwaConnection)
    .mockResolvedValue({ address: 'Addr1', authToken: 't', walletUriBase: 'w' });
  const serverError = Object.assign(new Error('locked'), { status: 409 });
  jest.mocked(connectMwaWallet).mockRejectedValue(serverError);
  await render(<MwaVaultProvider />);
  await waitFor(() => expect(connectedVaultWalletAddress()).toBe('Addr1'));
  await act(async () => {
    await expect(connectVaultWallet()).rejects.toBe(serverError);
  });
  expect(connectMwaWallet).toHaveBeenCalledWith(7, { isCurrent: expect.any(Function) });
  expect(connectedVaultWalletAddress()).toBe('Addr1');
});

/** A `connectMwaWallet` that stays open (the member is still in the wallet app) until settled. */
function pendingConnect() {
  const pending: { resolve: (address: string) => void; reject: (error: unknown) => void } = {
    resolve: () => undefined,
    reject: () => undefined,
  };
  jest.mocked(connectMwaWallet).mockImplementationOnce(
    () =>
      new Promise((resolve, reject) => {
        pending.resolve = (address) => resolve({ address, authToken: 't', walletUriBase: 'w' });
        pending.reject = reject;
      }),
  );
  return pending;
}

it('a double-tapped connect joins the one wallet session', async () => {
  jest.mocked(loadMwaConnection).mockResolvedValue(null);
  const pending = pendingConnect();
  await render(<MwaVaultProvider />);
  await waitFor(() => expect(vaultWalletKind()).toBe('mwa'));
  const first = connectVaultWallet();
  const second = connectVaultWallet();
  await act(async () => {
    pending.resolve('Addr3');
    await expect(Promise.all([first, second])).resolves.toEqual(['Addr3', 'Addr3']);
  });
  expect(connectMwaWallet).toHaveBeenCalledTimes(1);
});

it('a deposit/pay ensureWallet racing a Connect tap joins the same session', async () => {
  jest.mocked(loadMwaConnection).mockResolvedValue(null);
  const pending = pendingConnect();
  await render(<MwaVaultProvider />);
  await waitFor(() => expect(vaultWalletKind()).toBe('mwa'));
  const connecting = connectVaultWallet();
  const ensuring = ensureVaultWallet();
  await act(async () => {
    // Let ensureWallet's SecureStore read finish so it reaches `connect()` while still open.
    await Promise.resolve();
    pending.resolve('Addr4');
    await expect(Promise.all([connecting, ensuring])).resolves.toEqual(['Addr4', 'Addr4']);
  });
  expect(connectMwaWallet).toHaveBeenCalledTimes(1);
});

it('a retry after the 120 s seam timeout joins the still-running wallet session', async () => {
  jest.mocked(loadMwaConnection).mockResolvedValue(null);
  const pending = pendingConnect();
  await render(<MwaVaultProvider />);
  await waitFor(() => expect(vaultWalletKind()).toBe('mwa'));
  jest.useFakeTimers();
  try {
    const first = connectVaultWallet().catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(MWA_WALLET_TIMEOUT_MS + 1);
    await expect(first).resolves.toMatchObject({ kind: 'sessionFailed', reason: 'timed out' });
    const retry = connectVaultWallet();
    await act(async () => {
      pending.resolve('Addr6');
      await expect(retry).resolves.toBe('Addr6');
    });
    expect(connectMwaWallet).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

it('a failed or cancelled connect clears the in-flight session so the member can retry', async () => {
  jest.mocked(loadMwaConnection).mockResolvedValue(null);
  const pending = pendingConnect();
  await render(<MwaVaultProvider />);
  await waitFor(() => expect(vaultWalletKind()).toBe('mwa'));
  const cancelled = new Error('cancelled');
  const first = connectVaultWallet();
  await act(async () => {
    pending.reject(cancelled);
    await expect(first).rejects.toBe(cancelled);
  });
  jest
    .mocked(connectMwaWallet)
    .mockResolvedValueOnce({ address: 'Addr5', authToken: 't', walletUriBase: 'w' });
  await act(async () => {
    await expect(connectVaultWallet()).resolves.toBe('Addr5');
  });
  expect(connectMwaWallet).toHaveBeenCalledTimes(2);
});

it('signs through the MWA session for the signed-in user', async () => {
  jest
    .mocked(loadMwaConnection)
    .mockResolvedValue({ address: 'Addr1', authToken: 't', walletUriBase: 'w' });
  jest.mocked(signWithMwa).mockResolvedValue('SIGNED');
  await render(<MwaVaultProvider />);
  await waitFor(() => expect(vaultWalletKind()).toBe('mwa'));
  await expect(signVaultTransaction('UNSIGNED')).resolves.toBe('SIGNED');
  expect(signWithMwa).toHaveBeenCalledWith(7, 'UNSIGNED', { isCurrent: expect.any(Function) });
});

it('publishes a not-configured mwa handle when web3 is off', async () => {
  jest.mocked(useWeb3Enabled).mockReturnValue(false);
  jest.mocked(loadMwaConnection).mockResolvedValue(null);
  await render(<MwaVaultProvider />);
  // A handle really was published (a missing handle would leave the kind null).
  await waitFor(() => expect(vaultWalletKind()).toBe('mwa'));
  expect(isVaultWalletConfigured()).toBe(false);
  await expect(ensureVaultWallet()).rejects.toMatchObject({ kind: 'notConfigured' });
});

it('reset (sign-out / Disconnect) clears only the local connection', async () => {
  jest
    .mocked(loadMwaConnection)
    .mockResolvedValue({ address: 'Addr1', authToken: 't', walletUriBase: 'w' });
  await render(<MwaVaultProvider />);
  await waitFor(() => expect(connectedVaultWalletAddress()).toBe('Addr1'));
  await act(async () => {
    await resetVaultWallet();
  });
  expect(disconnectMwaWallet).toHaveBeenCalledWith(7);
  expect(connectMwaWallet).not.toHaveBeenCalled();
  await waitFor(() => expect(connectedVaultWalletAddress()).toBeNull());
});

it('reset still clears the local connection when web3 is off (sign-out after the flag flipped)', async () => {
  jest.mocked(useWeb3Enabled).mockReturnValue(false);
  jest
    .mocked(loadMwaConnection)
    .mockResolvedValue({ address: 'Addr1', authToken: 't', walletUriBase: 'w' });
  await render(<MwaVaultProvider />);
  await waitFor(() => expect(connectedVaultWalletAddress()).toBe('Addr1'));
  expect(isVaultWalletConfigured()).toBe(false);
  await act(async () => {
    await resetVaultWallet();
  });
  expect(disconnectMwaWallet).toHaveBeenCalledWith(7);
  await waitFor(() => expect(connectedVaultWalletAddress()).toBeNull());
});

it('reset during an in-flight connect drops its late result and the next connect opens a new session', async () => {
  jest.mocked(loadMwaConnection).mockResolvedValue(null);
  const stale = pendingConnect();
  await render(<MwaVaultProvider />);
  await waitFor(() => expect(vaultWalletKind()).toBe('mwa'));
  const first = connectVaultWallet();
  await act(async () => {
    await resetVaultWallet();
  });
  // A new connect does not join the session the reset abandoned.
  const fresh = pendingConnect();
  const second = connectVaultWallet();
  expect(connectMwaWallet).toHaveBeenCalledTimes(2);
  await act(async () => {
    stale.resolve('Late');
    // The abandoned call still settles for whoever awaited it...
    await expect(first).resolves.toBe('Late');
  });
  // ...but its address is never cached.
  expect(connectedVaultWalletAddress()).toBeNull();
  await act(async () => {
    fresh.resolve('Addr7');
    await expect(second).resolves.toBe('Addr7');
  });
  await waitFor(() => expect(connectedVaultWalletAddress()).toBe('Addr7'));
});
