import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

import { ApiMutationError } from '@/api/mutationError';
import { encodeBase58 } from '@/features/vault/solana/transactionVerifier';

import { createSiwsChallenge, linkWalletSiws } from '../../api/mwa';
import { WalletError } from '../walletError';
import {
  connectMwaWallet,
  disconnectMwaWallet,
  FOREGROUND_WAIT_MS,
  loadMwaConnection,
  NETWORK_RETRY_DELAY_MS,
  signWithMwa,
  TOKEN_REJECT_FAST_MS,
} from './mwaSession';

/** RN's jest mock makes `AppState.currentState` a mock fn; the app reads it as a plain value. */
const setAppState = (state: string) =>
  Object.defineProperty(AppState, 'currentState', { value: state, configurable: true, writable: true });

jest.mock('../../api/mwa', () => ({
  createSiwsChallenge: jest.fn(),
  linkWalletSiws: jest.fn(),
}));

const KEY_A = new Uint8Array(32).fill(1);
const KEY_B = new Uint8Array(32).fill(2);
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

function walletStub(over: Partial<Record<string, jest.Mock>> = {}) {
  return {
    authorize: jest.fn().mockResolvedValue({
      accounts: [{ address: b64(KEY_A) }],
      auth_token: 'tok',
      wallet_uri_base: 'https://wallet.example',
      sign_in_result: { address: b64(KEY_A), signed_message: 'bQ==', signature: 'cw==' },
    }),
    // The jest `@solana/web3.js` mock's VersionedTransaction round-trips its bytes.
    signTransactions: jest.fn(async ({ transactions }: { transactions: unknown[] }) => transactions),
    ...over,
  };
}

function runWith(wallet: ReturnType<typeof walletStub>) {
  jest.mocked(transact).mockImplementation(async (cb) => cb(wallet as never));
}

/** Smallest legacy tx the jest web3.js mock accepts: 1 sig, header, 1 key, blockhash, 0 ix. */
const TX = Uint8Array.from([1, ...new Array(64).fill(5), 1, 0, 0, 1, ...KEY_A, ...new Array(32).fill(0), 0]);

beforeEach(async () => {
  jest.clearAllMocks(); // call counts only; implementations stay (jest.config.js has no clearMocks)
  jest.replaceProperty(Platform, 'OS', 'android');
  setAppState('active');
  jest
    .mocked(createSiwsChallenge)
    .mockResolvedValue({ input: { domain: 'oneplan.space' }, challengeToken: 'ct' } as never);
  jest.mocked(linkWalletSiws).mockResolvedValue({ publicKey: encodeBase58(KEY_A) });
  await SecureStore.deleteItemAsync('mwa.connection.7');
});

describe('mwaSession', () => {
  it('connect runs SIWS, links on the server, and caches the connection', async () => {
    const wallet = walletStub();
    runWith(wallet);
    const conn = await connectMwaWallet(7);
    expect(conn.address).toBe(encodeBase58(KEY_A));
    expect(wallet.authorize).toHaveBeenCalledWith(
      expect.objectContaining({ chain: 'solana:devnet', sign_in_payload: { domain: 'oneplan.space' } }),
    );
    expect(linkWalletSiws).toHaveBeenCalledWith({
      challengeToken: 'ct',
      address: b64(KEY_A),
      signedMessage: 'bQ==',
      signature: 'cw==',
    });
    await expect(loadMwaConnection(7)).resolves.toEqual(conn);
  });

  it('an abandoned connect (isCurrent false at save time) returns the connection but persists nothing', async () => {
    runWith(walletStub());
    const isCurrent = jest.fn(() => false);
    const conn = await connectMwaWallet(7, { isCurrent });
    expect(conn.address).toBe(encodeBase58(KEY_A));
    expect(linkWalletSiws).toHaveBeenCalledTimes(1);
    expect(isCurrent).toHaveBeenCalled();
    await expect(loadMwaConnection(7)).resolves.toBeNull();
  });

  it('passes a server rejection (409 wallet_locked_by_vault) through unchanged and caches nothing', async () => {
    runWith(walletStub());
    const conflict = new ApiMutationError(409, { code: 'wallet_locked_by_vault', tripId: 42 });
    jest.mocked(linkWalletSiws).mockRejectedValue(conflict);
    await expect(connectMwaWallet(7)).rejects.toBe(conflict);
    await expect(loadMwaConnection(7)).resolves.toBeNull();
  });

  it('sign reuses the cached auth token and returns base64', async () => {
    runWith(walletStub());
    await connectMwaWallet(7);
    const wallet = walletStub();
    runWith(wallet);
    const out = await signWithMwa(7, b64(TX));
    expect(wallet.authorize).toHaveBeenCalledWith(expect.objectContaining({ auth_token: 'tok' }));
    expect(out).toBe(b64(TX));
  });

  it('serializes the legacy Transaction MWA returns leniently and restores a zeroed fee-payer signature', async () => {
    runWith(walletStub());
    await connectMwaWallet(7);
    const zeroed = Uint8Array.from(TX);
    zeroed.fill(0, 1, 65); // the wallet dropped the server's fee-payer signature
    // Like web3.js `Transaction.serialize`: throws unless both checks are switched off.
    const legacyOut = {
      serialize: jest.fn((opts?: { requireAllSignatures?: boolean; verifySignatures?: boolean }) => {
        if (opts?.requireAllSignatures !== false || opts?.verifySignatures !== false) {
          throw new Error('Signature verification failed');
        }
        return zeroed;
      }),
    };
    runWith(walletStub({ signTransactions: jest.fn().mockResolvedValue([legacyOut]) }));
    await expect(signWithMwa(7, b64(TX))).resolves.toBe(b64(TX));
    expect(legacyOut.serialize).toHaveBeenCalledWith({ requireAllSignatures: false, verifySignatures: false });
  });

  it('sign fails notAuthenticated when the wallet now authorizes a different account', async () => {
    runWith(walletStub());
    await connectMwaWallet(7);
    const wallet = walletStub({
      authorize: jest
        .fn()
        .mockResolvedValue({ accounts: [{ address: b64(KEY_B) }], auth_token: 'tok2', wallet_uri_base: 'x' }),
    });
    runWith(wallet);
    await expect(signWithMwa(7, b64(TX))).rejects.toMatchObject({ kind: 'notAuthenticated' });
    expect(wallet.signTransactions).not.toHaveBeenCalled();
  });

  describe('a dead cached auth_token (authorize -1 with auth_token)', () => {
    /**
     * What a device really throws inside the `transact` callback (MWA 2.3.0): the proxy returns
     * `invoke`'s promise un-awaited, so its `handleError` never converts the React Native
     * rejection (`promise.reject("JSON_RPC_ERROR", cause, userInfo)` in the Kotlin module).
     */
    const declined = () =>
      Object.assign(new Error('auth failed'), { code: 'JSON_RPC_ERROR', userInfo: { jsonRpcErrorCode: -1 } });
    /** The converted `SolanaMobileWalletAdapterProtocolError` shape (numeric code). */
    const declinedNumeric = () => Object.assign(new Error('auth failed'), { code: -1 });
    /** First call (with the cached token) fails -1; the tokenless retry answers `retry`. */
    function tokenRejected(retry: () => Promise<unknown>, reject: () => Error = declined) {
      return jest.fn(async (params: { auth_token?: string }) => {
        if (params.auth_token) throw reject();
        return retry();
      });
    }

    it.each([
      ['raw JSON_RPC_ERROR', declined],
      ['numeric -1', declinedNumeric],
    ])('re-authorizes without the token in the same session, signs, and saves the new token (%s)', async (_shape, reject) => {
      runWith(walletStub());
      await connectMwaWallet(7);
      const authorize = tokenRejected(
        async () => ({
          accounts: [{ address: b64(KEY_A) }],
          auth_token: 'fresh',
          wallet_uri_base: 'https://wallet.example',
        }),
        reject,
      );
      const wallet = walletStub({ authorize });
      runWith(wallet);
      await expect(signWithMwa(7, b64(TX))).resolves.toBe(b64(TX));
      expect(transact).toHaveBeenCalledTimes(2); // connect + one sign session, no second launch
      expect(authorize).toHaveBeenCalledTimes(2);
      expect(authorize).toHaveBeenNthCalledWith(1, expect.objectContaining({ auth_token: 'tok' }));
      // Exact match: the retry carries no auth_token at all.
      expect(authorize).toHaveBeenNthCalledWith(2, { chain: 'solana:devnet', identity: expect.any(Object) });
      expect(wallet.signTransactions).toHaveBeenCalledTimes(1);
      await expect(loadMwaConnection(7)).resolves.toMatchObject({ address: encodeBase58(KEY_A), authToken: 'fresh' });
    });

    it('a -1 on the tokenless retry is the member declining: cancelled', async () => {
      runWith(walletStub());
      await connectMwaWallet(7);
      const wallet = walletStub({ authorize: tokenRejected(async () => Promise.reject(declined())) });
      runWith(wallet);
      await expect(signWithMwa(7, b64(TX))).rejects.toMatchObject({ kind: 'cancelled' });
      expect(wallet.authorize).toHaveBeenCalledTimes(2);
      expect(wallet.signTransactions).not.toHaveBeenCalled();
    });

    describe('timed: a fast -1 is a dead token, a slow -1 is the member declining the prompt', () => {
      afterEach(() => jest.useRealTimers());

      /** The token-bearing authorize rejects -1 after `ms`; the tokenless retry succeeds. */
      function tokenRejectedAfter(ms: number) {
        return jest.fn(async (params: { auth_token?: string }) => {
          if (params.auth_token) {
            await new Promise((r) => setTimeout(r, ms));
            throw declined();
          }
          return {
            accounts: [{ address: b64(KEY_A) }],
            auth_token: 'fresh',
            wallet_uri_base: 'https://wallet.example',
          };
        });
      }

      it('a -1 just under the threshold (no prompt was shown) retries without the token', async () => {
        runWith(walletStub());
        await connectMwaWallet(7);
        jest.useFakeTimers();
        const authorize = tokenRejectedAfter(TOKEN_REJECT_FAST_MS - 1);
        const wallet = walletStub({ authorize });
        runWith(wallet);
        const signed = signWithMwa(7, b64(TX)).catch((e: unknown) => e);
        await jest.advanceTimersByTimeAsync(TOKEN_REJECT_FAST_MS - 1);
        await expect(signed).resolves.toBe(b64(TX));
        expect(authorize).toHaveBeenCalledTimes(2);
        expect(authorize).toHaveBeenNthCalledWith(2, { chain: 'solana:devnet', identity: expect.any(Object) });
        await expect(loadMwaConnection(7)).resolves.toMatchObject({ authToken: 'fresh' });
      });

      it('a -1 after the threshold (the member saw a prompt and declined) is cancelled, no second prompt', async () => {
        runWith(walletStub());
        await connectMwaWallet(7);
        jest.useFakeTimers();
        const authorize = tokenRejectedAfter(TOKEN_REJECT_FAST_MS);
        const wallet = walletStub({ authorize });
        runWith(wallet);
        const signed = signWithMwa(7, b64(TX)).catch((e: unknown) => e);
        await jest.advanceTimersByTimeAsync(TOKEN_REJECT_FAST_MS);
        await expect(signed).resolves.toMatchObject({ kind: 'cancelled' });
        expect(authorize).toHaveBeenCalledTimes(1);
        expect(wallet.signTransactions).not.toHaveBeenCalled();
        // The token may be dead behind a prompt: drop it, keep the address.
        await expect(loadMwaConnection(7)).resolves.toEqual({
          address: encodeBase58(KEY_A),
          authToken: null,
          walletUriBase: 'https://wallet.example',
        });
      });

      it('after a slow -1, the next sign authorizes once without a token, signs, and saves the new token', async () => {
        runWith(walletStub());
        await connectMwaWallet(7);
        jest.useFakeTimers();
        runWith(walletStub({ authorize: tokenRejectedAfter(TOKEN_REJECT_FAST_MS) }));
        const declinedSign = signWithMwa(7, b64(TX)).catch((e: unknown) => e);
        await jest.advanceTimersByTimeAsync(TOKEN_REJECT_FAST_MS);
        await expect(declinedSign).resolves.toMatchObject({ kind: 'cancelled' });

        const authorize = tokenRejectedAfter(0);
        const wallet = walletStub({ authorize });
        runWith(wallet);
        await expect(signWithMwa(7, b64(TX))).resolves.toBe(b64(TX));
        expect(authorize).toHaveBeenCalledTimes(1);
        expect(authorize).toHaveBeenCalledWith({ chain: 'solana:devnet', identity: expect.any(Object) });
        expect(wallet.signTransactions).toHaveBeenCalledTimes(1);
        await expect(loadMwaConnection(7)).resolves.toMatchObject({
          address: encodeBase58(KEY_A),
          authToken: 'fresh',
        });
      });

      it('a tokenless connection whose authorize returns a different account fails notAuthenticated', async () => {
        await SecureStore.setItemAsync(
          'mwa.connection.7',
          JSON.stringify({ address: encodeBase58(KEY_A), authToken: null, walletUriBase: 'x' }),
        );
        const wallet = walletStub({
          authorize: jest
            .fn()
            .mockResolvedValue({ accounts: [{ address: b64(KEY_B) }], auth_token: 'other', wallet_uri_base: 'x' }),
        });
        runWith(wallet);
        await expect(signWithMwa(7, b64(TX))).rejects.toMatchObject({ kind: 'notAuthenticated' });
        expect(wallet.authorize).toHaveBeenCalledTimes(1);
        expect(wallet.signTransactions).not.toHaveBeenCalled();
        await expect(loadMwaConnection(7)).resolves.toMatchObject({ authToken: null });
      });
    });

    it('a retry that authorizes a different account fails notAuthenticated without signing', async () => {
      runWith(walletStub());
      await connectMwaWallet(7);
      const wallet = walletStub({
        authorize: tokenRejected(async () => ({
          accounts: [{ address: b64(KEY_B) }],
          auth_token: 'other',
          wallet_uri_base: 'x',
        })),
      });
      runWith(wallet);
      await expect(signWithMwa(7, b64(TX))).rejects.toMatchObject({ kind: 'notAuthenticated' });
      expect(wallet.signTransactions).not.toHaveBeenCalled();
      await expect(loadMwaConnection(7)).resolves.toMatchObject({ authToken: 'tok' });
    });

    describe('a reset (Disconnect / sign-out) while the sign is open persists nothing', () => {
      afterEach(() => jest.useRealTimers());

      it('the refreshed token of a fast -1 retry is not saved', async () => {
        runWith(walletStub());
        await connectMwaWallet(7);
        let current = true;
        const authorize = tokenRejected(async () => {
          // The member taps Disconnect while the wallet's connect prompt is up.
          await disconnectMwaWallet(7);
          current = false;
          return { accounts: [{ address: b64(KEY_A) }], auth_token: 'fresh', wallet_uri_base: 'w' };
        });
        runWith(walletStub({ authorize }));
        await expect(signWithMwa(7, b64(TX), { isCurrent: () => current })).resolves.toBe(b64(TX));
        await expect(loadMwaConnection(7)).resolves.toBeNull();
      });

      it('a slow -1 does not write the token-dropped connection back', async () => {
        runWith(walletStub());
        await connectMwaWallet(7);
        jest.useFakeTimers();
        let current = true;
        const authorize = jest.fn(async () => {
          await new Promise((r) => setTimeout(r, TOKEN_REJECT_FAST_MS));
          await disconnectMwaWallet(7);
          current = false;
          throw declined();
        });
        runWith(walletStub({ authorize }));
        const signed = signWithMwa(7, b64(TX), { isCurrent: () => current }).catch((e: unknown) => e);
        await jest.advanceTimersByTimeAsync(TOKEN_REJECT_FAST_MS);
        await expect(signed).resolves.toMatchObject({ kind: 'cancelled' });
        expect(authorize).toHaveBeenCalledTimes(1);
        await expect(loadMwaConnection(7)).resolves.toBeNull();
      });
    });
  });

  describe("OnePlan still behind the wallet app (Android cuts a backgrounded app's network)", () => {
    /** OnePlan in the background; returns a function that brings it back to the foreground. */
    function inBackground() {
      setAppState('background');
      let listener: ((state: string) => void) | undefined;
      const remove = jest.fn();
      jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, cb) => {
        listener = cb as (state: string) => void;
        return { remove } as never;
      });
      return { foreground: () => listener?.('active'), remove };
    }

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    it('links on the server only once OnePlan is back in front', async () => {
      runWith(walletStub());
      const app = inBackground();
      const connecting = connectMwaWallet(7);
      await new Promise((resolve) => setImmediate(resolve));
      expect(linkWalletSiws).not.toHaveBeenCalled();
      app.foreground();
      await expect(connecting).resolves.toMatchObject({ address: encodeBase58(KEY_A) });
      expect(linkWalletSiws).toHaveBeenCalledTimes(1);
      expect(app.remove).toHaveBeenCalled();
    });

    it('stops waiting after FOREGROUND_WAIT_MS and links anyway', async () => {
      jest.useFakeTimers();
      runWith(walletStub());
      inBackground();
      const connecting = connectMwaWallet(7);
      await jest.advanceTimersByTimeAsync(FOREGROUND_WAIT_MS);
      await expect(connecting).resolves.toMatchObject({ address: encodeBase58(KEY_A) });
      expect(linkWalletSiws).toHaveBeenCalledTimes(1);
    });

    it('hands signed bytes back only once OnePlan is back in front', async () => {
      runWith(walletStub());
      await SecureStore.setItemAsync(
        'mwa.connection.7',
        JSON.stringify({ address: encodeBase58(KEY_A), authToken: 'tok', walletUriBase: 'x' }),
      );
      const app = inBackground();
      let settled = false;
      const signing = signWithMwa(7, b64(TX)).finally(() => {
        settled = true;
      });
      await new Promise((resolve) => setImmediate(resolve));
      expect(settled).toBe(false);
      app.foreground();
      await expect(signing).resolves.toEqual(expect.any(String));
    });
  });

  describe('network failures (the request never reached the server)', () => {
    const unknownHost = () =>
      new TypeError(
        'fetch failed: java.net.UnknownHostException: Unable to resolve host "dev-api.oneplan.space": No address associated with hostname',
      );

    afterEach(() => jest.useRealTimers());

    it('retries the link once and succeeds', async () => {
      jest.useFakeTimers();
      runWith(walletStub());
      jest.mocked(linkWalletSiws).mockRejectedValueOnce(unknownHost());
      const connecting = connectMwaWallet(7);
      await jest.advanceTimersByTimeAsync(NETWORK_RETRY_DELAY_MS);
      await expect(connecting).resolves.toMatchObject({ address: encodeBase58(KEY_A) });
      expect(linkWalletSiws).toHaveBeenCalledTimes(2);
    });

    it('reports a network error (not "Could not sign") when the retry fails too', async () => {
      jest.useFakeTimers();
      runWith(walletStub());
      jest.mocked(linkWalletSiws).mockRejectedValue(unknownHost());
      const connecting = connectMwaWallet(7);
      const outcome = expect(connecting).rejects.toMatchObject({ kind: 'network' });
      await jest.advanceTimersByTimeAsync(NETWORK_RETRY_DELAY_MS);
      await outcome;
      expect(linkWalletSiws).toHaveBeenCalledTimes(2);
      await expect(loadMwaConnection(7)).resolves.toBeNull();
    });

    it('never retries a server answer', async () => {
      runWith(walletStub());
      jest
        .mocked(linkWalletSiws)
        .mockRejectedValue(new ApiMutationError(409, { code: 'wallet_locked_by_vault' }));
      await expect(connectMwaWallet(7)).rejects.toBeInstanceOf(ApiMutationError);
      expect(linkWalletSiws).toHaveBeenCalledTimes(1);
    });

    it('maps a failed challenge request to a network error', async () => {
      jest.mocked(createSiwsChallenge).mockRejectedValue(new TypeError('Network request failed'));
      await expect(connectMwaWallet(7)).rejects.toMatchObject({ kind: 'network' });
      expect(transact).not.toHaveBeenCalled();
    });
  });

  it('maps ERROR_WALLET_NOT_FOUND to walletNotInstalled', async () => {
    jest.mocked(transact).mockRejectedValue(Object.assign(new Error('x'), { code: 'ERROR_WALLET_NOT_FOUND' }));
    await expect(connectMwaWallet(7)).rejects.toEqual(WalletError.walletNotInstalled());
  });

  it('maps a declined prompt (protocol -1 / -3, Back press, association cancelled) to cancelled', async () => {
    for (const code of [-1, -3, 'EUNSPECIFIED', 'ERROR_ASSOCIATION_CANCELLED']) {
      jest.mocked(transact).mockRejectedValue(Object.assign(new Error('x'), { code }));
      await expect(connectMwaWallet(7)).rejects.toMatchObject({ kind: 'cancelled' });
    }
  });

  describe('native MWA module errors (string codes from SolanaMobileWalletAdapterModule)', () => {
    const rejectWith = (error: unknown) => jest.mocked(transact).mockRejectedValue(error);

    it('maps "Timed out waiting for local association to be ready" to walletTimedOut', async () => {
      rejectWith(Object.assign(new Error('x'), { code: 'Timed out waiting for local association to be ready' }));
      await expect(connectMwaWallet(7)).rejects.toMatchObject({ kind: 'walletTimedOut' });
    });

    it('maps "Timed out waiting for response" (wallet silent 90 s) to walletTimedOut', async () => {
      rejectWith(Object.assign(new Error('x'), { code: 'Timed out waiting for response' }));
      await expect(connectMwaWallet(7)).rejects.toMatchObject({ kind: 'walletTimedOut' });
    });

    it('maps EUNSPECIFIED carrying a TimeoutException message to walletTimedOut, not a quiet cancel', async () => {
      rejectWith(Object.assign(new Error('java.util.concurrent.TimeoutException'), { code: 'EUNSPECIFIED' }));
      await expect(connectMwaWallet(7)).rejects.toMatchObject({ kind: 'walletTimedOut' });
    });

    it('maps a TimeoutException in the code itself to walletTimedOut', async () => {
      rejectWith(Object.assign(new Error('x'), { code: 'java.util.concurrent.TimeoutException' }));
      await expect(connectMwaWallet(7)).rejects.toMatchObject({ kind: 'walletTimedOut' });
    });

    it('keeps EUNSPECIFIED with a CancellationException message as cancelled', async () => {
      rejectWith(Object.assign(new Error('java.util.concurrent.CancellationException'), { code: 'EUNSPECIFIED' }));
      await expect(connectMwaWallet(7)).rejects.toMatchObject({ kind: 'cancelled' });
    });

    it('maps "Session not established: Local association cancelled by user" to cancelled', async () => {
      rejectWith(
        Object.assign(new Error('x'), { code: 'Session not established: Local association cancelled by user' }),
      );
      await expect(connectMwaWallet(7)).rejects.toMatchObject({ kind: 'cancelled' });
    });

    it('maps "Failed to end session" to sessionFailed with a readable reason', async () => {
      rejectWith(Object.assign(new Error('x'), { code: 'Failed to end session' }));
      await expect(connectMwaWallet(7)).rejects.toEqual(
        WalletError.sessionFailed('wallet session ended unexpectedly'),
      );
    });

    it('applies the same mapping when signing', async () => {
      runWith(walletStub());
      await connectMwaWallet(7);
      jest.mocked(transact).mockRejectedValue(Object.assign(new Error('x'), { code: 'Timed out waiting for response' }));
      await expect(signWithMwa(7, b64(TX))).rejects.toMatchObject({ kind: 'walletTimedOut' });
    });
  });

  it.each([
    ['numeric -3', { code: -3 }],
    ['raw JSON_RPC_ERROR -3', { code: 'JSON_RPC_ERROR', userInfo: { jsonRpcErrorCode: -3 } }],
  ])('maps a declined signature (%s) to cancelled, not signingFailed', async (_shape, fields) => {
    runWith(walletStub());
    await connectMwaWallet(7);
    runWith(
      walletStub({
        signTransactions: jest.fn().mockRejectedValue(Object.assign(new Error('declined'), fields)),
      }),
    );
    await expect(signWithMwa(7, b64(TX))).rejects.toMatchObject({ kind: 'cancelled' });
  });

  it('sign without a connection fails sessionNotReady', async () => {
    await expect(signWithMwa(7, b64(TX))).rejects.toMatchObject({ kind: 'sessionNotReady' });
  });

  it('disconnect clears only the local connection and never opens the wallet', async () => {
    runWith(walletStub());
    await connectMwaWallet(7);
    jest.mocked(transact).mockClear();
    await disconnectMwaWallet(7);
    expect(transact).not.toHaveBeenCalled();
    await expect(loadMwaConnection(7)).resolves.toBeNull();
  });

  it('never loads MWA off Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await expect(connectMwaWallet(7)).rejects.toMatchObject({ kind: 'notConfigured' });
    expect(transact).not.toHaveBeenCalled();
    expect(createSiwsChallenge).not.toHaveBeenCalled();
  });

  it('on iOS, importing and using the session never evaluates the MWA module', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    // On device the real package throws at import (TurboModuleRegistry.getEnforcing) off Android.
    const factory = jest.fn(() => {
      throw new Error('MWA module evaluated on iOS');
    });
    // Fresh registry, or the already-cached mock (top-level import above) is returned without
    // ever consulting this factory.
    jest.resetModules();
    jest.doMock('@solana-mobile/mobile-wallet-adapter-protocol-web3js', factory);
    try {
      let session!: typeof import('./mwaSession');
      let store!: typeof SecureStore;
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        session = require('./mwaSession') as typeof import('./mwaSession');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        store = require('expo-secure-store') as typeof SecureStore;
      });
      await expect(session.connectMwaWallet(7)).rejects.toMatchObject({ kind: 'notConfigured' });
      const cached = { address: encodeBase58(KEY_A), authToken: 'tok', walletUriBase: 'x' };
      await store.setItemAsync('mwa.connection.7', JSON.stringify(cached));
      await expect(session.signWithMwa(7, b64(TX))).rejects.toMatchObject({ kind: 'notConfigured' });
      await session.disconnectMwaWallet(7);
      await expect(session.loadMwaConnection(7)).resolves.toBeNull();
      expect(factory).not.toHaveBeenCalled();
    } finally {
      jest.dontMock('@solana-mobile/mobile-wallet-adapter-protocol-web3js');
    }
  });
});
