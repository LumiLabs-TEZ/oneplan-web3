import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { ApiMutationError } from '@/api/mutationError';
import { initI18n } from '@/i18n';

import { WalletError } from '../wallet/walletError';
import {
  connectVaultWallet,
  connectedVaultWalletAddress,
  resetVaultWallet,
  vaultWalletKind,
} from '../wallet/walletHandle';
import { ConnectWalletCard } from './ConnectWalletCard';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockHandleListeners = new Set<() => void>();
jest.mock('../wallet/walletHandle', () => ({
  connectVaultWallet: jest.fn(),
  connectedVaultWalletAddress: jest.fn(),
  vaultWalletKind: jest.fn(),
  resetVaultWallet: jest.fn(async () => undefined),
  subscribeWalletHandle: (listener: () => void) => {
    mockHandleListeners.add(listener);
    return () => mockHandleListeners.delete(listener);
  },
}));

/** What `setWalletHandle` does when the provider republishes. */
function publishHandle() {
  mockHandleListeners.forEach((listener) => listener());
}

beforeAll(() => {
  initI18n();
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(vaultWalletKind).mockReturnValue('mwa');
  jest.mocked(connectedVaultWalletAddress).mockReturnValue(null);
});

it('renders nothing for the Privy backend', async () => {
  jest.mocked(vaultWalletKind).mockReturnValue('privy');
  const screen = await render(<ConnectWalletCard />);
  expect(screen.queryByTestId('connect-wallet-card')).toBeNull();
  expect(screen.queryByTestId('connect-wallet-button')).toBeNull();
});

it('connects, reports the address, and switches to the connected state', async () => {
  jest.mocked(connectVaultWallet).mockResolvedValue('Addr1');
  const onConnected = jest.fn();
  const screen = await render(<ConnectWalletCard onConnected={onConnected} />);
  await fireEvent.press(screen.getByTestId('connect-wallet-button'));
  await waitFor(() => expect(onConnected).toHaveBeenCalledWith('Addr1'));
  expect(screen.getByText('Addr1')).toBeTruthy();
  expect(screen.getByTestId('connect-wallet-disconnect')).toBeTruthy();
});

it('stays connected through the provider republishing its own connect', async () => {
  jest.mocked(connectVaultWallet).mockResolvedValue('Addr1');
  const screen = await render(<ConnectWalletCard />);
  await fireEvent.press(screen.getByTestId('connect-wallet-button'));
  await waitFor(() => expect(screen.getByText('Addr1')).toBeTruthy());
  jest.mocked(connectedVaultWalletAddress).mockReturnValue('Addr1');
  await act(async () => publishHandle());
  expect(screen.getByText('Addr1')).toBeTruthy();
  expect(screen.queryByTestId('connect-wallet-button')).toBeNull();
});

it('shows the .skr name and Seeker badge when already connected', async () => {
  jest.mocked(connectedVaultWalletAddress).mockReturnValue('9RqQabcdefghDzQi');
  const screen = await render(<ConnectWalletCard skrDomain="alice" isSeeker />);
  expect(screen.getByText('alice.skr')).toBeTruthy();
  expect(screen.getByTestId('seeker-badge')).toBeTruthy();
});

it('follows the published handle: a connection loaded or made elsewhere, then cleared', async () => {
  const screen = await render(<ConnectWalletCard />);
  expect(screen.getByTestId('connect-wallet-button')).toBeTruthy();

  // e.g. the cached MWA connection finished loading, or the deposit sheet connected.
  jest.mocked(connectedVaultWalletAddress).mockReturnValue('Addr2');
  await act(async () => publishHandle());
  expect(screen.getByText('Addr2')).toBeTruthy();

  // e.g. sign-out reset the local connection.
  jest.mocked(connectedVaultWalletAddress).mockReturnValue(null);
  await act(async () => publishHandle());
  expect(screen.getByTestId('connect-wallet-button')).toBeTruthy();
});

it('appears once the wallet provider publishes an MWA handle after mount', async () => {
  jest.mocked(vaultWalletKind).mockReturnValue(null);
  const screen = await render(<ConnectWalletCard />);
  expect(screen.queryByTestId('connect-wallet-card')).toBeNull();
  jest.mocked(vaultWalletKind).mockReturnValue('mwa');
  await act(async () => publishHandle());
  expect(screen.getByTestId('connect-wallet-button')).toBeTruthy();
});

it('Disconnect clears the local connection and offers Connect again', async () => {
  jest.mocked(connectedVaultWalletAddress).mockReturnValue('Addr1');
  const onDisconnected = jest.fn();
  const screen = await render(<ConnectWalletCard onDisconnected={onDisconnected} />);
  await fireEvent.press(screen.getByTestId('connect-wallet-disconnect'));
  await waitFor(() => expect(screen.getByTestId('connect-wallet-button')).toBeTruthy());
  expect(resetVaultWallet).toHaveBeenCalledTimes(1);
  expect(connectVaultWallet).not.toHaveBeenCalled();
  expect(onDisconnected).toHaveBeenCalledTimes(1);
});

it('shows the wallet as connected when it is reconnected elsewhere after a Disconnect', async () => {
  jest.mocked(connectedVaultWalletAddress).mockReturnValue('AddrA');
  const screen = await render(<ConnectWalletCard />);
  await fireEvent.press(screen.getByTestId('connect-wallet-disconnect'));
  // The provider's reset republishes with no connection.
  jest.mocked(connectedVaultWalletAddress).mockReturnValue(null);
  await act(async () => publishHandle());
  expect(screen.getByTestId('connect-wallet-button')).toBeTruthy();

  // A withdraw/deposit/pay on this screen runs ensureVaultWallet → connect; the same wallet
  // comes back and the provider republishes it.
  jest.mocked(connectedVaultWalletAddress).mockReturnValue('AddrA');
  await act(async () => publishHandle());
  expect(screen.getByText('AddrA')).toBeTruthy();
  expect(screen.getByTestId('connect-wallet-disconnect')).toBeTruthy();
});

it('opens the install sheet when no wallet app exists', async () => {
  jest.mocked(connectVaultWallet).mockRejectedValue(WalletError.walletNotInstalled());
  const screen = await render(<ConnectWalletCard />);
  await fireEvent.press(screen.getByTestId('connect-wallet-button'));
  expect(await screen.findByTestId('no-wallet-sheet')).toBeTruthy();
  // The dismiss scrim is announced as a button, not an unlabelled-role surface.
  const scrim = screen.getByLabelText('Close');
  expect(scrim.props.accessibilityRole).toBe('button');
});

it('shows the re-link guard message for a 409 wallet_locked_by_vault', async () => {
  jest
    .mocked(connectVaultWallet)
    .mockRejectedValue(new ApiMutationError(409, { code: 'wallet_locked_by_vault', tripId: 42 }));
  const screen = await render(<ConnectWalletCard />);
  await fireEvent.press(screen.getByTestId('connect-wallet-button'));
  expect(
    await screen.findByText('Finish or leave your active group wallet before switching wallets.'),
  ).toBeTruthy();
});

it('explains a 409 wallet_claimed_in_open_vault (key held by a member of an active trip)', async () => {
  jest
    .mocked(connectVaultWallet)
    .mockRejectedValue(new ApiMutationError(409, { code: 'wallet_claimed_in_open_vault' }));
  const screen = await render(<ConnectWalletCard />);
  await fireEvent.press(screen.getByTestId('connect-wallet-button'));
  expect(
    await screen.findByText(
      "This wallet is linked to another OnePlan account that's in an active trip. Ask them to finish or leave that trip.",
    ),
  ).toBeTruthy();
});

it('shows the wallet error for other wallet failures', async () => {
  jest.mocked(connectVaultWallet).mockRejectedValue(WalletError.signingFailed('boom'));
  const screen = await render(<ConnectWalletCard />);
  await fireEvent.press(screen.getByTestId('connect-wallet-button'));
  expect(await screen.findByTestId('connect-wallet-error')).toBeTruthy();
  expect(screen.getByText('Could not sign: boom')).toBeTruthy();
});

it('stays quiet when the member cancels in the wallet', async () => {
  let reject: (error: unknown) => void = () => undefined;
  jest.mocked(connectVaultWallet).mockReturnValue(
    new Promise<string>((_, r) => {
      reject = r;
    }),
  );
  const screen = await render(<ConnectWalletCard />);
  await fireEvent.press(screen.getByTestId('connect-wallet-button'));
  // Busy while the wallet app is open: the button shows a spinner instead of its label.
  expect(screen.queryByText('Connect wallet')).toBeNull();
  await act(async () => {
    reject(WalletError.cancelled());
  });
  // Settled (label back), and the cancel produced no error text and no install sheet.
  await waitFor(() => expect(screen.getByText('Connect wallet')).toBeTruthy());
  expect(screen.queryByTestId('connect-wallet-error')).toBeNull();
  expect(screen.queryByTestId('no-wallet-sheet')).toBeNull();
});

it('labels Connect with its visible text and reports busy while the wallet is open', async () => {
  jest.mocked(connectVaultWallet).mockReturnValue(new Promise<string>(() => undefined));
  const screen = await render(<ConnectWalletCard />);
  const idle = screen.getByTestId('connect-wallet-button');
  expect(idle.props.accessibilityRole).toBe('button');
  expect(idle.props.accessibilityLabel).toBe('Connect wallet');
  expect(idle.props.accessibilityState).toEqual({ busy: false, disabled: false });

  await fireEvent.press(screen.getByTestId('connect-wallet-button'));
  // Spinner replaces the text, but the accessible name stays.
  expect(screen.queryByText('Connect wallet')).toBeNull();
  const busy = screen.getByTestId('connect-wallet-button');
  expect(busy.props.accessibilityLabel).toBe('Connect wallet');
  expect(busy.props.accessibilityState).toEqual({ busy: true, disabled: true });
});

it('labels Disconnect and reports busy while disconnecting', async () => {
  jest.mocked(connectedVaultWalletAddress).mockReturnValue('Addr1');
  jest.mocked(resetVaultWallet).mockReturnValue(new Promise<undefined>(() => undefined));
  const screen = await render(<ConnectWalletCard />);
  const idle = screen.getByTestId('connect-wallet-disconnect');
  expect(idle.props.accessibilityLabel).toBe('Disconnect');
  expect(idle.props.accessibilityState).toEqual({ busy: false, disabled: false });

  await fireEvent.press(screen.getByTestId('connect-wallet-disconnect'));
  expect(screen.getByTestId('connect-wallet-disconnect').props.accessibilityState).toEqual({
    busy: true,
    disabled: true,
  });
});
