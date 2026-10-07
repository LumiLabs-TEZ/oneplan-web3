import { WalletError } from './walletError';
import {
  _resetWalletHandleForTests,
  connectedVaultWalletAddress,
  connectVaultWallet,
  ensureVaultWallet,
  isVaultWalletConfigured,
  isVaultWalletReady,
  resetVaultWallet,
  setWalletHandle,
  signVaultTransaction,
  subscribeWalletHandle,
  vaultWalletKind,
  type WalletHandle,
} from './walletHandle';
import { MWA_WALLET_TIMEOUT_MS, WALLET_SETUP_TIMEOUT_MS } from './walletTimeout';

afterEach(() => {
  _resetWalletHandleForTests();
});

describe('walletHandle (unconfigured / unmounted)', () => {
  it('reports not configured before any handle is published', () => {
    expect(isVaultWalletConfigured()).toBe(false);
    expect(isVaultWalletReady()).toBe(false);
  });

  it('ensureVaultWallet rejects with WalletError.notConfigured', async () => {
    await expect(ensureVaultWallet()).rejects.toBeInstanceOf(WalletError);
    await expect(ensureVaultWallet()).rejects.toMatchObject({ kind: 'notConfigured' });
  });

  it('signVaultTransaction rejects with WalletError.notConfigured', async () => {
    await expect(signVaultTransaction('BASE64')).rejects.toMatchObject({
      kind: 'notConfigured',
    });
  });

  it('resetVaultWallet no-ops', async () => {
    await expect(resetVaultWallet()).resolves.toBeUndefined();
  });
});

describe('walletHandle (explicitly unconfigured handle, e.g. env.privyAppId unset)', () => {
  it('still reports not configured and rejects the same way', async () => {
    setWalletHandle({
      kind: 'privy',
      isConfigured: false,
      isReady: false,
      connectedAddress: null,
      ensureWallet: () => Promise.reject(new Error('should not be called')),
      connect: () => Promise.reject(new Error('should not be called')),
      sign: () => Promise.reject(new Error('should not be called')),
      reset: () => Promise.resolve(),
    });

    expect(isVaultWalletConfigured()).toBe(false);
    await expect(ensureVaultWallet()).rejects.toMatchObject({ kind: 'notConfigured' });
  });
});

describe('resetVaultWallet on an unconfigured handle', () => {
  const unconfigured = (kind: WalletHandle['kind'], reset: () => Promise<void>): WalletHandle => ({
    kind,
    isConfigured: false,
    isReady: false,
    connectedAddress: null,
    ensureWallet: () => Promise.reject(new Error('should not be called')),
    connect: () => Promise.reject(new Error('should not be called')),
    sign: () => Promise.reject(new Error('should not be called')),
    reset,
  });

  it('still resets an MWA handle (web3 off must not leave the local wallet connection behind)', async () => {
    const reset = jest.fn(async () => undefined);
    setWalletHandle(unconfigured('mwa', reset));
    await resetVaultWallet();
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('leaves an unconfigured Privy handle alone, as before', async () => {
    const reset = jest.fn(async () => undefined);
    setWalletHandle(unconfigured('privy', reset));
    await resetVaultWallet();
    expect(reset).not.toHaveBeenCalled();
  });
});

describe('walletHandle (configured)', () => {
  it('delegates ensureWallet/sign/reset to the published handle', async () => {
    const ensureWallet = jest.fn(async () => 'ADDR');
    const sign = jest.fn(async (tx: string) => `signed:${tx}`);
    const reset = jest.fn(async () => undefined);

    setWalletHandle({
      kind: 'privy',
      isConfigured: true,
      isReady: true,
      connectedAddress: null,
      ensureWallet,
      connect: ensureWallet,
      sign,
      reset,
    });

    expect(isVaultWalletConfigured()).toBe(true);
    expect(isVaultWalletReady()).toBe(true);
    await expect(ensureVaultWallet()).resolves.toBe('ADDR');
    await expect(signVaultTransaction('UNSIGNED')).resolves.toBe('signed:UNSIGNED');
    await resetVaultWallet();
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe('walletHandle timeout', () => {
  afterEach(() => jest.useRealTimers());

  it('ensureVaultWallet rejects instead of hanging when Privy never becomes ready', async () => {
    jest.useFakeTimers();
    setWalletHandle({
      kind: 'privy',
      isConfigured: true,
      isReady: false,
      connectedAddress: null,
      ensureWallet: () => new Promise(() => undefined),
      connect: () => new Promise(() => undefined),
      sign: () => Promise.reject(new Error('unused')),
      reset: () => Promise.resolve(),
    });
    const settled = ensureVaultWallet().catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(WALLET_SETUP_TIMEOUT_MS + 1);
    await expect(settled).resolves.toMatchObject({ kind: 'sessionFailed', reason: 'timed out' });
  });

  it('passes a prompt result through and clears the timer', async () => {
    setWalletHandle({
      kind: 'privy',
      isConfigured: true,
      isReady: true,
      connectedAddress: null,
      ensureWallet: () => Promise.resolve('ADDR'),
      connect: () => Promise.resolve('ADDR'),
      sign: () => Promise.reject(new Error('unused')),
      reset: () => Promise.resolve(),
    });
    await expect(ensureVaultWallet()).resolves.toBe('ADDR');
  });

  /** A configured handle whose ensureWallet/connect/sign stay pending until the test settles them. */
  function publishPending(kind: WalletHandle['kind']) {
    const pending: { resolve: (value: string) => void } = { resolve: () => undefined };
    const wait = () =>
      new Promise<string>((r) => {
        pending.resolve = r;
      });
    setWalletHandle({
      kind,
      isConfigured: true,
      isReady: true,
      connectedAddress: null,
      ensureWallet: wait,
      connect: wait,
      sign: wait,
      reset: () => Promise.resolve(),
    });
    return pending;
  }

  it('gives MWA ensureWallet the 120 s budget, not 20 s (the member is approving in their wallet app)', async () => {
    jest.useFakeTimers();
    expect(MWA_WALLET_TIMEOUT_MS).toBe(120_000);
    const pending = publishPending('mwa');
    const settled = ensureVaultWallet().catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(WALLET_SETUP_TIMEOUT_MS + 1);
    pending.resolve('ADDR');
    await expect(settled).resolves.toBe('ADDR');
  });

  it.each([
    ['ensureVaultWallet', () => ensureVaultWallet()],
    ['connectVaultWallet', () => connectVaultWallet()],
    ['signVaultTransaction', () => signVaultTransaction('UNSIGNED')],
  ])('MWA %s rejects as timed out after 120 s instead of spinning forever', async (_name, call) => {
    jest.useFakeTimers();
    publishPending('mwa');
    let outcome: unknown = 'pending';
    void call().then(
      (value) => {
        outcome = value;
      },
      (error: unknown) => {
        outcome = error;
      },
    );
    await jest.advanceTimersByTimeAsync(MWA_WALLET_TIMEOUT_MS - 1);
    expect(outcome).toBe('pending');
    await jest.advanceTimersByTimeAsync(2);
    expect(outcome).toMatchObject({ kind: 'sessionFailed', reason: 'timed out' });
  });

  it('keeps the 20 s bound on a Privy connectVaultWallet', async () => {
    jest.useFakeTimers();
    publishPending('privy');
    const settled = connectVaultWallet().catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(WALLET_SETUP_TIMEOUT_MS + 1);
    await expect(settled).resolves.toMatchObject({ kind: 'sessionFailed', reason: 'timed out' });
  });

  it('leaves a Privy signVaultTransaction unbounded, as before', async () => {
    jest.useFakeTimers();
    const pending = publishPending('privy');
    const settled = signVaultTransaction('UNSIGNED').catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(MWA_WALLET_TIMEOUT_MS + 1);
    pending.resolve('SIGNED');
    await expect(settled).resolves.toBe('SIGNED');
  });
});

describe('walletHandle accessors', () => {
  it('report null before any handle is published', async () => {
    expect(vaultWalletKind()).toBeNull();
    expect(connectedVaultWalletAddress()).toBeNull();
    await expect(connectVaultWallet()).rejects.toMatchObject({ kind: 'notConfigured' });
  });

  it('expose the published kind and connected address, and route connect to the handle', async () => {
    const ensureWallet = jest.fn(async () => 'ENSURED');
    const connect = jest.fn(async () => 'CONNECTED');
    setWalletHandle({
      kind: 'mwa',
      isConfigured: true,
      isReady: true,
      connectedAddress: 'Addr1',
      ensureWallet,
      connect,
      sign: jest.fn(async (tx: string) => tx),
      reset: jest.fn(async () => undefined),
    });
    expect(vaultWalletKind()).toBe('mwa');
    expect(connectedVaultWalletAddress()).toBe('Addr1');
    await expect(connectVaultWallet()).resolves.toBe('CONNECTED');
    expect(ensureWallet).not.toHaveBeenCalled();
  });
});

describe('subscribeWalletHandle', () => {
  it('notifies on every publish until unsubscribed (lets components follow connect/disconnect)', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeWalletHandle(listener);
    const base: WalletHandle = {
      kind: 'mwa',
      isConfigured: true,
      isReady: true,
      connectedAddress: null,
      ensureWallet: jest.fn(async () => 'A'),
      connect: jest.fn(async () => 'A'),
      sign: jest.fn(async (tx: string) => tx),
      reset: jest.fn(async () => undefined),
    };
    setWalletHandle(base);
    expect(listener).toHaveBeenCalledTimes(1);
    setWalletHandle({ ...base, connectedAddress: 'Addr1' });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(connectedVaultWalletAddress()).toBe('Addr1');
    unsubscribe();
    setWalletHandle(null);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
