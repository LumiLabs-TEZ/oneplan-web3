import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { initI18n } from '@/i18n';
import { WalletError } from '../wallet/walletError';
import { WALLET_SETUP_TIMEOUT_MS } from '../wallet/walletTimeout';

const mockRouterPush = jest.fn();
const mockRouterBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockRouterPush(...args), back: () => mockRouterBack() },
}));

jest.mock('@/features/me/useMe', () => ({ useMe: () => ({ data: { id: 42 } }) }));

const mockLinkWalletMutateAsync = jest.fn(async () => ({ publicKey: 'ADDR' }));
jest.mock('../api/mutations', () => ({
  useLinkWallet: () => ({ mutateAsync: mockLinkWalletMutateAsync }),
}));

const mockEnsureVaultWallet = jest.fn(async () => 'ADDR');
jest.mock('../wallet/walletHandle', () => ({
  ensureVaultWallet: () => mockEnsureVaultWallet(),
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

  it('marks seen and dismisses from the close button too', async () => {
    const onClose = jest.fn();
    const screen = await render(<WelcomeTripWalletSheet onClose={onClose} />);
    await fireEvent.press(screen.getByTestId('welcome-trip-wallet-close'));
    expect(useTripWalletWelcomeStore.getState().seenUserIds).toEqual(['42']);
    expect(onClose).toHaveBeenCalledTimes(1);
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
    // The X still closes it.
    const onClose = jest.fn();
    await screen.rerender(<WelcomeTripWalletSheet onClose={onClose} />);
    await fireEvent.press(screen.getByTestId('welcome-trip-wallet-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
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
