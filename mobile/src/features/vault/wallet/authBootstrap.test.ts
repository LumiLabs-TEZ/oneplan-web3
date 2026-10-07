import { linkWallet } from '../api/mutations';
import { ensureWalletLinked } from './authBootstrap';
import { _resetWalletHandleForTests, setWalletHandle, type WalletHandle } from './walletHandle';

jest.mock('../api/mutations', () => ({ linkWallet: jest.fn(async () => ({ publicKey: 'ADDR' })) }));

function publish(kind: WalletHandle['kind']) {
  const ensureWallet = jest.fn(async () => 'ADDR');
  setWalletHandle({
    kind,
    isConfigured: true,
    isReady: true,
    connectedAddress: null,
    ensureWallet,
    connect: ensureWallet,
    sign: jest.fn(async (tx: string) => tx),
    reset: jest.fn(async () => undefined),
  });
  return ensureWallet;
}

beforeEach(() => {
  _resetWalletHandleForTests();
  jest.mocked(linkWallet).mockClear();
});

it('re-links the Privy wallet on sign-in', async () => {
  const ensureWallet = publish('privy');
  await ensureWalletLinked();
  expect(ensureWallet).toHaveBeenCalledTimes(1);
  expect(linkWallet).toHaveBeenCalledWith({ publicKey: 'ADDR' });
});

it('never opens a wallet or re-links on sign-in for MWA', async () => {
  const ensureWallet = publish('mwa');
  await ensureWalletLinked();
  expect(ensureWallet).not.toHaveBeenCalled();
  expect(linkWallet).not.toHaveBeenCalled();
});
