import { WalletError } from './walletError';
import {
  _resetWalletHandleForTests,
  ensureVaultWallet,
  isVaultWalletConfigured,
  isVaultWalletReady,
  resetVaultWallet,
  setWalletHandle,
  signVaultTransaction,
} from './walletHandle';
import { WALLET_SETUP_TIMEOUT_MS } from './walletTimeout';

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
      isConfigured: false,
      isReady: false,
      ensureWallet: () => Promise.reject(new Error('should not be called')),
      sign: () => Promise.reject(new Error('should not be called')),
      reset: () => Promise.resolve(),
    });

    expect(isVaultWalletConfigured()).toBe(false);
    await expect(ensureVaultWallet()).rejects.toMatchObject({ kind: 'notConfigured' });
  });
});

describe('walletHandle (configured)', () => {
  it('delegates ensureWallet/sign/reset to the published handle', async () => {
    const ensureWallet = jest.fn(async () => 'ADDR');
    const sign = jest.fn(async (tx: string) => `signed:${tx}`);
    const reset = jest.fn(async () => undefined);

    setWalletHandle({ isConfigured: true, isReady: true, ensureWallet, sign, reset });

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
      isConfigured: true,
      isReady: false,
      ensureWallet: () => new Promise(() => undefined),
      sign: () => Promise.reject(new Error('unused')),
      reset: () => Promise.resolve(),
    });
    const settled = ensureVaultWallet().catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(WALLET_SETUP_TIMEOUT_MS + 1);
    await expect(settled).resolves.toMatchObject({ kind: 'sessionFailed', reason: 'timed out' });
  });

  it('passes a prompt result through and clears the timer', async () => {
    setWalletHandle({
      isConfigured: true,
      isReady: true,
      ensureWallet: () => Promise.resolve('ADDR'),
      sign: () => Promise.reject(new Error('unused')),
      reset: () => Promise.resolve(),
    });
    await expect(ensureVaultWallet()).resolves.toBe('ADDR');
  });
});
