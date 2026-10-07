import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { initI18n } from '@/i18n';
import { WalletError } from '../wallet/walletError';
import { WALLET_SETUP_TIMEOUT_MS } from '../wallet/walletTimeout';

const mockRouterPush = jest.fn();
const mockRouterBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockRouterPush(...args), back: () => mockRouterBack() },
}));

// Rendered without a SafeAreaProvider; the sheet reads the bottom inset.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/features/me/useMe', () => ({ useMe: () => ({ data: { id: 42 } }) }));

const mockLinkWalletMutateAsync = jest.fn(async () => ({ publicKey: 'ADDR' }));
jest.mock('../api/mutations', () => ({
  useLinkWallet: () => ({ mutateAsync: mockLinkWalletMutateAsync }),
}));

const mockEnsureVaultWallet = jest.fn(async () => 'ADDR');
const mockVaultWalletKind = jest.fn<'privy' | 'mwa' | null, []>(() => 'privy');
const mockConnectedAddress = jest.fn<string | null, []>(() => null);
jest.mock('../wallet/walletHandle', () => ({
  ensureVaultWallet: () => mockEnsureVaultWallet(),
  vaultWalletKind: () => mockVaultWalletKind(),
  connectedVaultWalletAddress: () => mockConnectedAddress(),
  connectVaultWallet: jest.fn(),
  resetVaultWallet: jest.fn(),
  subscribeWalletHandle: () => () => undefined,
}));

// eslint-disable-next-line import/first -- must follow the jest.mock hoists
import { WelcomeTripWalletSheet } from './WelcomeTripWalletSheet';
// eslint-disable-next-line import/first
import { useTripWalletWelcomeStore } from '../tripWalletWelcomeStore';

describe('WelcomeTripWalletSheet', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    useTripWalletWelcomeStore.setState({ seenUserIds: [] });
    mockRouterPush.mockClear();
    mockRouterBack.mockClear();
    mockEnsureVaultWallet.mockClear();
    mockLinkWalletMutateAsync.mockClear();
    mockEnsureVaultWallet.mockReset();
    mockEnsureVaultWallet.mockImplementation(async () => 'ADDR');
    mockVaultWalletKind.mockReturnValue('privy');
    mockConnectedAddress.mockReturnValue(null);
  });

  it('on Android (MWA) does not auto-run setup; shows the Connect card and allows Continue', async () => {
    mockVaultWalletKind.mockReturnValue('mwa');
    const screen = await render(<WelcomeTripWalletSheet />);
    expect(screen.getByTestId('connect-wallet-button')).toBeTruthy();
    expect(mockEnsureVaultWallet).not.toHaveBeenCalled();
    expect(mockLinkWalletMutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText('Continue').parent?.props.accessibilityState?.disabled).toBe(false);
  });

  it('on Android the disclosure says the member’s own wallet app holds the keys', async () => {
    mockVaultWalletKind.mockReturnValue('mwa');
    const screen = await render(<WelcomeTripWalletSheet />);
    expect(
      screen.getByText(/Your own Solana wallet app holds your keys and signs every payment\./),
    ).toBeTruthy();
    expect(screen.queryByText(/wallet provider/)).toBeNull();
    expect(screen.queryByText(/Privy/)).toBeNull();
  });

  it('on iOS (Privy) the disclosure copy is unchanged', async () => {
    const screen = await render(<WelcomeTripWalletSheet />);
    await waitFor(() => expect(screen.getByText('ADDR')).toBeTruthy());
    expect(
      screen.getByText(
        /Setting up a wallet creates a Solana account tied to your OnePlan sign-in, through our wallet provider\./,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Your own Solana wallet app/)).toBeNull();
  });

  it('on Android shows an already-connected MWA wallet without opening it', async () => {
    mockVaultWalletKind.mockReturnValue('mwa');
    mockConnectedAddress.mockReturnValue('ADDR');
    const screen = await render(<WelcomeTripWalletSheet />);
    expect(screen.getByText('ADDR')).toBeTruthy();
    expect(mockEnsureVaultWallet).not.toHaveBeenCalled();
  });

  it('links the wallet on mount and shows the shortened address', async () => {
    const screen = await render(<WelcomeTripWalletSheet />);
    await waitFor(() => expect(screen.getByText('ADDR')).toBeTruthy());
    expect(mockEnsureVaultWallet).toHaveBeenCalledTimes(1);
    expect(mockLinkWalletMutateAsync).toHaveBeenCalledWith({ publicKey: 'ADDR' });
  });

  it('disables Continue while setting up, enables it once linked', async () => {
    let resolveEnsure: (address: string) => void = () => undefined;
    mockEnsureVaultWallet.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveEnsure = resolve;
      }),
    );

    const screen = await render(<WelcomeTripWalletSheet />);
    expect(screen.getByText('Continue').parent?.props.accessibilityState?.disabled).toBe(true);

    resolveEnsure('ADDR');
    await waitFor(() =>
      expect(screen.getByText('Continue').parent?.props.accessibilityState?.disabled).toBe(false),
    );
  });

  it('marks the welcome seen for the current user on Continue', async () => {
    const screen = await render(<WelcomeTripWalletSheet />);
    await waitFor(() => expect(screen.getByText('ADDR')).toBeTruthy());
    await fireEvent.press(screen.getByText('Continue'));
    expect(useTripWalletWelcomeStore.getState().seenUserIds).toEqual(['42']);
  });

  it('has no close button, and marks seen when swiped away (unmounted)', async () => {
    const screen = await render(<WelcomeTripWalletSheet />);
    expect(screen.queryByTestId('welcome-trip-wallet-close')).toBeNull();
    expect(useTripWalletWelcomeStore.getState().seenUserIds).toEqual([]);
    await screen.unmount();
    expect(useTripWalletWelcomeStore.getState().seenUserIds).toEqual(['42']);
  });

  it('navigates to the how-money-is-held route from the disclosure link', async () => {
    const screen = await render(<WelcomeTripWalletSheet />);
    await fireEvent.press(screen.getByText('See how your money is held'));
    expect(mockRouterPush).toHaveBeenCalledWith('/how-money-is-held');
  });

  it('shows a not-configured error with Retry instead of spinning when the wallet is not configured', async () => {
    mockEnsureVaultWallet.mockRejectedValue(WalletError.notConfigured());
    const screen = await render(<WelcomeTripWalletSheet />);
    await waitFor(() =>
      expect(screen.getByTestId('welcome-trip-wallet-error')).toHaveTextContent(
        'Wallet is not configured for this build.',
      ),
    );
    expect(screen.getByText('Could not set up wallet')).toBeTruthy();
    expect(screen.queryByText('Setting up your wallet')).toBeNull();
    expect(screen.getByTestId('welcome-trip-wallet-retry')).toBeTruthy();
    // Continue stays disabled; swiping the sheet away still marks it seen.
    await screen.unmount();
    expect(useTripWalletWelcomeStore.getState().seenUserIds).toEqual(['42']);
  });

  it('shows an error when the server link call fails (wallet endpoint 404)', async () => {
    mockLinkWalletMutateAsync.mockRejectedValueOnce(new Error('POST /wallet/link failed: 404'));
    const screen = await render(<WelcomeTripWalletSheet />);
    await waitFor(() =>
      expect(screen.getByTestId('welcome-trip-wallet-error')).toHaveTextContent(
        'POST /wallet/link failed: 404',
      ),
    );
    expect(screen.queryByText('Setting up your wallet')).toBeNull();
  });

  it('Retry re-runs setup and recovers', async () => {
    mockEnsureVaultWallet.mockRejectedValueOnce(WalletError.sessionNotReady());
    const screen = await render(<WelcomeTripWalletSheet />);
    await waitFor(() => expect(screen.getByTestId('welcome-trip-wallet-retry')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('welcome-trip-wallet-retry'));
    await waitFor(() => expect(screen.getByText('ADDR')).toBeTruthy());
    expect(mockEnsureVaultWallet).toHaveBeenCalledTimes(2);
  });

  it('times out instead of spinning forever when the link request never settles', async () => {
    jest.useFakeTimers();
    try {
      mockLinkWalletMutateAsync.mockReturnValueOnce(new Promise(() => undefined));
      const screen = await render(<WelcomeTripWalletSheet />);
      expect(screen.getByText('Setting up your wallet')).toBeTruthy();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(WALLET_SETUP_TIMEOUT_MS + 1);
      });
      expect(screen.getByTestId('welcome-trip-wallet-error')).toBeTruthy();
      expect(screen.queryByText('Setting up your wallet')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
