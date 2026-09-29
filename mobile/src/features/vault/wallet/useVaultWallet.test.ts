import { useEmbeddedSolanaWallet, usePrivy } from '@privy-io/expo';
import { renderHook } from '@testing-library/react-native';

import { WalletError } from './walletError';
import { _resetEnsureWalletGuardForTests, useVaultWallet } from './useVaultWallet';

const mockedUsePrivy = jest.mocked(usePrivy);
const mockedUseEmbeddedSolanaWallet = jest.mocked(useEmbeddedSolanaWallet);

afterEach(() => {
  _resetEnsureWalletGuardForTests();
  mockedUsePrivy.mockReset();
  mockedUseEmbeddedSolanaWallet.mockReset();
});

function privy(overrides: Partial<ReturnType<typeof usePrivy>> = {}) {
  mockedUsePrivy.mockReturnValue({
    user: null,
    isReady: true,
    error: null,
    logout: jest.fn(async () => undefined),
    getAccessToken: jest.fn(async () => null),
    refreshUser: jest.fn(async () => ({ user: null }) as never),
    ...overrides,
  } as ReturnType<typeof usePrivy>);
}

describe('useVaultWallet — ensureWallet', () => {
  it('returns the existing (lowest-address) wallet without creating a new one', async () => {
    privy();
    const create = jest.fn();
    mockedUseEmbeddedSolanaWallet.mockReturnValue({
      status: 'connected',
      wallets: [
        { address: 'ZZZ', publicKey: 'ZZZ', walletIndex: 1, getProvider: jest.fn() },
        { address: 'AAA', publicKey: 'AAA', walletIndex: 0, getProvider: jest.fn() },
      ],
      create,
      getProvider: jest.fn(),
      recover: jest.fn(),
    } as never);

    const { result } = await renderHook(() => useVaultWallet());
    await expect(result.current.ensureWallet()).resolves.toBe('AAA');
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a wallet when status is not-created', async () => {
    privy();
    const provider = { _publicKey: 'NEW' };
    let wallets: { address: string }[] = [];
    const create = jest.fn(async () => {
      wallets = [{ address: 'NEW' }];
      return provider;
    });
    mockedUseEmbeddedSolanaWallet.mockImplementation(
      () =>
        ({
          status: wallets.length > 0 ? 'connected' : 'not-created',
          wallets,
          create,
          getProvider: jest.fn(),
          recover: jest.fn(),
        }) as never,
    );

    const { result, rerender } = await renderHook(() => useVaultWallet());
    const address = await result.current.ensureWallet();
    expect(address).toBe('NEW');
    expect(create).toHaveBeenCalledTimes(1);
    await rerender({});
  });

  it('rejects with creationFailed when create() throws', async () => {
    privy();
    mockedUseEmbeddedSolanaWallet.mockReturnValue({
      status: 'not-created',
      wallets: [],
      create: jest.fn(async () => {
        throw new Error('network down');
      }),
      getProvider: jest.fn(),
      recover: jest.fn(),
    } as never);

    const { result } = await renderHook(() => useVaultWallet());
    await expect(result.current.ensureWallet()).rejects.toMatchObject({
      kind: 'creationFailed',
      reason: 'network down',
    });
  });

  it('rejects with creationFailed when create() returns null (Android Drive-recovery caveat)', async () => {
    privy();
    mockedUseEmbeddedSolanaWallet.mockReturnValue({
      status: 'not-created',
      wallets: [],
      create: jest.fn(async () => null),
      getProvider: jest.fn(),
      recover: jest.fn(),
    } as never);

    const { result } = await renderHook(() => useVaultWallet());
    await expect(result.current.ensureWallet()).rejects.toMatchObject({ kind: 'creationFailed' });
  });

  it('rejects with sessionNotReady for any non-terminal, non-connected status', async () => {
    privy();
    mockedUseEmbeddedSolanaWallet.mockReturnValue({
      status: 'connecting',
      create: jest.fn(),
    } as never);

    const { result } = await renderHook(() => useVaultWallet());
    await expect(result.current.ensureWallet()).rejects.toMatchObject({
      kind: 'sessionNotReady',
    });
  });

  it('dedupes concurrent ensureWallet callers into one create() call (single-flight)', async () => {
    privy();
    let resolveCreate: (v: { _publicKey: string }) => void;
    let wallets: { address: string }[] = [];
    const create = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveCreate = (v) => {
            wallets = [{ address: v._publicKey }];
            resolve(v);
          };
        }),
    );
    mockedUseEmbeddedSolanaWallet.mockImplementation(
      () =>
        ({
          status: wallets.length > 0 ? 'connected' : 'not-created',
          wallets,
          create,
          getProvider: jest.fn(),
          recover: jest.fn(),
        }) as never,
    );

    const { result } = await renderHook(() => useVaultWallet());
    const p1 = result.current.ensureWallet();
    const p2 = result.current.ensureWallet();
    resolveCreate!({ _publicKey: 'SHARED' });

    await expect(p1).resolves.toBe('SHARED');
    await expect(p2).resolves.toBe('SHARED');
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('useVaultWallet — sign', () => {
  it('signs a base64 legacy transaction and returns the re-encoded result', async () => {
    privy();
    const signedTransaction = { serialize: () => Buffer.from('signed-bytes') };
    const request = jest.fn(async () => ({ signedTransaction }));
    mockedUseEmbeddedSolanaWallet.mockReturnValue({
      status: 'connected',
      wallets: [
        { address: 'ADDR', publicKey: 'ADDR', walletIndex: 0, getProvider: async () => ({ request }) },
      ],
      create: jest.fn(),
      getProvider: jest.fn(),
      recover: jest.fn(),
    } as never);

    // A minimal valid legacy Solana transaction: 0 signatures, header, 0 accounts,
    // 32-byte blockhash, 0 instructions — enough for VersionedTransaction.deserialize.
    const legacy = Buffer.concat([
      Buffer.from([0]), // signature count (shortvec)
      Buffer.from([0, 0, 0]), // header
      Buffer.from([0]), // account count
      Buffer.alloc(32), // blockhash
      Buffer.from([0]), // instruction count
    ]).toString('base64');

    const { result } = await renderHook(() => useVaultWallet());
    await expect(result.current.sign(legacy)).resolves.toBe(
      Buffer.from('signed-bytes').toString('base64'),
    );
    expect(request).toHaveBeenCalledWith({
      method: 'signTransaction',
      params: { transaction: expect.anything() },
    });
  });

  it('wraps a provider rejection (e.g. the user declining) in WalletError.signingFailed', async () => {
    privy();
    const request = jest.fn(async () => {
      throw new Error('User declined the request');
    });
    mockedUseEmbeddedSolanaWallet.mockReturnValue({
      status: 'connected',
      wallets: [
        { address: 'ADDR', publicKey: 'ADDR', walletIndex: 0, getProvider: async () => ({ request }) },
      ],
      create: jest.fn(),
      getProvider: jest.fn(),
      recover: jest.fn(),
    } as never);

    const legacy = Buffer.concat([
      Buffer.from([0]),
      Buffer.from([0, 0, 0]),
      Buffer.from([0]),
      Buffer.alloc(32),
      Buffer.from([0]),
    ]).toString('base64');

    const { result } = await renderHook(() => useVaultWallet());
    const promise = result.current.sign(legacy);
    await expect(promise).rejects.toBeInstanceOf(WalletError);
    await expect(promise).rejects.toMatchObject({
      kind: 'signingFailed',
      reason: 'User declined the request',
    });
  });

  it('rejects with malformedTransaction when the base64 does not decode', async () => {
    privy();
    mockedUseEmbeddedSolanaWallet.mockReturnValue({
      status: 'connected',
      wallets: [
        {
          address: 'ADDR',
          publicKey: 'ADDR',
          walletIndex: 0,
          getProvider: jest.fn(async () => ({ request: jest.fn() })),
        },
      ],
      create: jest.fn(),
      getProvider: jest.fn(),
      recover: jest.fn(),
    } as never);

    const { result } = await renderHook(() => useVaultWallet());
    await expect(result.current.sign('not-valid-base64-tx')).rejects.toMatchObject({
      kind: 'malformedTransaction',
    });
  });
});

describe('useVaultWallet — reset', () => {
  it('logs out when a user is present', async () => {
    const logout = jest.fn(async () => undefined);
    privy({ user: { id: 'u1' } as never, logout });
    mockedUseEmbeddedSolanaWallet.mockReturnValue({
      status: 'not-created',
      wallets: [],
      create: jest.fn(),
    } as never);

    const { result } = await renderHook(() => useVaultWallet());
    await result.current.reset();
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when there is no user', async () => {
    const logout = jest.fn(async () => undefined);
    privy({ user: null, logout });
    mockedUseEmbeddedSolanaWallet.mockReturnValue({
      status: 'not-created',
      wallets: [],
      create: jest.fn(),
    } as never);

    const { result } = await renderHook(() => useVaultWallet());
    await result.current.reset();
    expect(logout).not.toHaveBeenCalled();
  });
});

