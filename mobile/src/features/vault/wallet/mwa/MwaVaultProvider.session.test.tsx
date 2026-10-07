/**
 * `MwaVaultProvider` over the real `mwaSession` (SecureStore fake + mocked `transact`), for the
 * cases where what lands in SecureStore matters: a connect abandoned by a Disconnect or sign-out
 * must not persist its connection when it finally settles, and neither may a sign's token refresh.
 */
import { transact } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { act, render, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

import { _resetSignOutHooksForTests, runSignOutHooks } from '@/auth/signOutHooks';
import { encodeBase58 } from '@/features/vault/solana/transactionVerifier';

import { createSiwsChallenge, linkWalletSiws } from '../../api/mwa';
import { useWeb3Enabled } from '../../web3Flag';
import { installVaultSignOutHook } from '../authBootstrap';
import {
  _resetWalletHandleForTests,
  connectedVaultWalletAddress,
  connectVaultWallet,
  ensureVaultWallet,
  resetVaultWallet,
  signVaultTransaction,
  vaultWalletKind,
} from '../walletHandle';
import { loadMwaConnection } from './mwaSession';
import { MwaVaultProvider } from './MwaVaultProvider';

/** RN's jest mock makes `AppState.currentState` a mock fn; the app reads it as a plain value. */
const setAppState = (state: string) =>
  Object.defineProperty(AppState, 'currentState', { value: state, configurable: true, writable: true });

jest.mock('../../web3Flag', () => ({ useWeb3Enabled: jest.fn() }));
jest.mock('@/features/me/useMe', () => ({ useMe: () => ({ data: { id: 7 } }) }));
jest.mock('../../api/mwa', () => ({ createSiwsChallenge: jest.fn(), linkWalletSiws: jest.fn() }));
jest.mock('../../api/mutations', () => ({ linkWallet: jest.fn() }));

const KEY_A = new Uint8Array(32).fill(1);
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const ADDR_A = encodeBase58(KEY_A);

/** One wallet session per call, each held open until the test answers it (the member approving). */
function walletSessions() {
  const answers: (() => void)[] = [];
  jest.mocked(transact).mockImplementation(
    (cb) =>
      new Promise((resolve, reject) => {
        answers.push(() => {
          const wallet = {
            authorize: jest.fn(async () => ({
              accounts: [{ address: b64(KEY_A) }],
              auth_token: 'tok',
              wallet_uri_base: 'https://wallet.example',
              sign_in_result: { address: b64(KEY_A), signed_message: 'bQ==', signature: 'cw==' },
            })),
            // The jest `@solana/web3.js` mock's VersionedTransaction round-trips its bytes.
            signTransactions: jest.fn(async ({ transactions }: { transactions: unknown[] }) => transactions),
          };
          Promise.resolve(cb(wallet as never)).then(resolve, reject);
        });
      }),
  );
  return answers;
}

beforeEach(async () => {
  jest.clearAllMocks();
  _resetWalletHandleForTests();
  _resetSignOutHooksForTests();
  jest.replaceProperty(Platform, 'OS', 'android');
  setAppState('active');
  jest.mocked(useWeb3Enabled).mockReturnValue(true);
  jest
    .mocked(createSiwsChallenge)
    .mockResolvedValue({ input: { domain: 'oneplan.space' }, challengeToken: 'ct' } as never);
  jest.mocked(linkWalletSiws).mockResolvedValue({ publicKey: ADDR_A });
  await SecureStore.deleteItemAsync('mwa.connection.7');
});

it.each([
  ['Disconnect', () => resetVaultWallet()],
  [
    'sign-out',
    () => {
      installVaultSignOutHook();
      return runSignOutHooks();
    },
  ],
])('%s during an in-flight connect persists nothing, and ensureWallet then opens a fresh session', async (_name, abandon) => {
  const sessions = walletSessions();
  await render(<MwaVaultProvider />);
  await waitFor(() => expect(vaultWalletKind()).toBe('mwa'));
  const first = connectVaultWallet();
  await waitFor(() => expect(sessions).toHaveLength(1));
  await act(async () => {
    await abandon();
  });
  await act(async () => {
    sessions[0]!();
    // The abandoned call still settles for its awaiter (the server link already happened).
    await expect(first).resolves.toBe(ADDR_A);
  });
  await expect(loadMwaConnection(7)).resolves.toBeNull();
  expect(connectedVaultWalletAddress()).toBeNull();

  const ensuring = ensureVaultWallet();
  await waitFor(() => expect(sessions).toHaveLength(2));
  await act(async () => {
    sessions[1]!();
    await expect(ensuring).resolves.toBe(ADDR_A);
  });
  expect(transact).toHaveBeenCalledTimes(2);
  await expect(loadMwaConnection(7)).resolves.toMatchObject({ address: ADDR_A, authToken: 'tok' });
  await waitFor(() => expect(connectedVaultWalletAddress()).toBe(ADDR_A));
});

it('Disconnect during an open sign does not write the refreshed token back', async () => {
  await SecureStore.setItemAsync(
    'mwa.connection.7',
    JSON.stringify({ address: ADDR_A, authToken: 'old', walletUriBase: 'https://wallet.example' }),
  );
  // The wallet answers the saved-token authorize with a refreshed token ('tok' ≠ 'old').
  const sessions = walletSessions();
  await render(<MwaVaultProvider />);
  await waitFor(() => expect(connectedVaultWalletAddress()).toBe(ADDR_A));
  // Smallest legacy tx the jest web3.js mock accepts: 1 sig, header, 1 key, blockhash, 0 ix.
  const tx = Uint8Array.from([1, ...new Array(64).fill(5), 1, 0, 0, 1, ...KEY_A, ...new Array(32).fill(0), 0]);
  const signing = signVaultTransaction(b64(tx));
  await waitFor(() => expect(sessions).toHaveLength(1));
  await act(async () => {
    await resetVaultWallet();
  });
  await act(async () => {
    sessions[0]!();
    await expect(signing).resolves.toBe(b64(tx));
  });
  await expect(loadMwaConnection(7)).resolves.toBeNull();
  expect(connectedVaultWalletAddress()).toBeNull();
});
