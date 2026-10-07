import { act, fireEvent, render } from '@testing-library/react-native';

import { ApiMutationError } from '@/api/mutationError';
import { initI18n } from '@/i18n';

import { useWallet, useWalletHistory } from '../api/queries';
import { OnePlanWalletScreen } from './OnePlanWalletScreen';

// Rendered without a SafeAreaProvider; the screen reads the top inset for its back button.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../api/queries');
const mockEligibility = jest.fn(() => ({
  data: { eligible: true, hasWeb3Trip: true, faucetEnabled: false, mwaEnabled: false },
}));
jest.mock('../api/eligibility', () => ({ useWeb3Eligibility: () => mockEligibility() }));
const mockClaimMutate = jest.fn();
let mockClaimPending = false;
jest.mock('../api/mwa', () => ({
  useClaimFaucet: () => ({ mutate: mockClaimMutate, isPending: mockClaimPending }),
}));

const mockedUseWallet = jest.mocked(useWallet);
const mockedUseWalletHistory = jest.mocked(useWalletHistory);

describe('OnePlanWalletScreen', () => {
  beforeAll(() => {
    initI18n();
  });

  it('shows "No activity yet" when the wallet has no history', async () => {
    mockedUseWallet.mockReturnValue({
      data: { publicKey: 'X', usdcAta: 'Y', balanceMicro: '0' },
      isLoading: false,
    } as never);
    mockedUseWalletHistory.mockReturnValue({ data: [], isLoading: false } as never);

    const screen = await render(
      <OnePlanWalletScreen onBack={jest.fn()} onWithdraw={jest.fn()} onDeposit={jest.fn()} />,
    );
    expect(screen.getByText('No activity yet')).toBeTruthy();
  });

  it('a wallet-history load failure does not blank the balance', async () => {
    mockedUseWallet.mockReturnValue({
      data: { publicKey: 'X', usdcAta: 'Y', balanceMicro: '120000000' },
      isLoading: false,
    } as never);
    mockedUseWalletHistory.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as never);

    const screen = await render(
      <OnePlanWalletScreen onBack={jest.fn()} onWithdraw={jest.fn()} onDeposit={jest.fn()} />,
    );
    expect(screen.getByText('120')).toBeTruthy();
    expect(screen.getByText('No activity yet')).toBeTruthy();
  });

  it('renders history rows when present', async () => {
    mockedUseWallet.mockReturnValue({
      data: { publicKey: 'X', usdcAta: 'Y', balanceMicro: '0' },
      isLoading: false,
    } as never);
    mockedUseWalletHistory.mockReturnValue({
      data: [
        {
          id: 'sig1',
          kind: 'deposit',
          address: 'D3ade7xyzabcdefghijklmnop',
          amountMicro: '100000000',
          blockTime: '0',
          createdAt: '2026-01-01T08:10:00.000Z',
        },
      ],
      isLoading: false,
    } as never);

    const screen = await render(
      <OnePlanWalletScreen onBack={jest.fn()} onWithdraw={jest.fn()} onDeposit={jest.fn()} />,
    );
    expect(screen.getByText('Deposit USDC')).toBeTruthy();
  });

  it('Withdraw/Deposit buttons fire their callbacks', async () => {
    mockedUseWallet.mockReturnValue({
      data: { publicKey: 'X', usdcAta: 'Y', balanceMicro: '0' },
      isLoading: false,
    } as never);
    mockedUseWalletHistory.mockReturnValue({ data: [], isLoading: false } as never);
    const onWithdraw = jest.fn();
    const onDeposit = jest.fn();

    const screen = await render(
      <OnePlanWalletScreen onBack={jest.fn()} onWithdraw={onWithdraw} onDeposit={onDeposit} />,
    );
    await fireEvent.press(screen.getByTestId('wallet-screen-withdraw'));
    expect(onWithdraw).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('wallet-screen-deposit'));
    expect(onDeposit).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner instead of the balance while loading', async () => {
    mockedUseWallet.mockReturnValue({ data: undefined, isLoading: true } as never);
    mockedUseWalletHistory.mockReturnValue({ data: [], isLoading: false } as never);

    const screen = await render(
      <OnePlanWalletScreen onBack={jest.fn()} onWithdraw={jest.fn()} onDeposit={jest.fn()} />,
    );
    expect(screen.queryByText('VND')).toBeNull();
  });
  describe('test-USDC faucet', () => {
    beforeEach(() => {
      mockClaimMutate.mockReset();
      mockClaimPending = false;
      mockedUseWallet.mockReturnValue({
        data: { publicKey: 'X', usdcAta: 'Y', balanceMicro: '0', skrDomain: null, isSeeker: false },
        isLoading: false,
      } as never);
      mockedUseWalletHistory.mockReturnValue({ data: [], isLoading: false } as never);
      mockEligibility.mockReturnValue({
        data: { eligible: true, hasWeb3Trip: true, faucetEnabled: true, mwaEnabled: false },
      });
    });

    const renderScreen = () =>
      render(
        <OnePlanWalletScreen onBack={jest.fn()} onWithdraw={jest.fn()} onDeposit={jest.fn()} />,
      );

    const failClaimWith = (error: ApiMutationError) =>
      mockClaimMutate.mockImplementation(
        (_vars: unknown, opts: { onError?: (e: unknown) => void }) => opts.onError?.(error),
      );

    it('hides the faucet button unless the server enables it', async () => {
      mockEligibility.mockReturnValue({
        data: { eligible: true, hasWeb3Trip: true, faucetEnabled: false, mwaEnabled: false },
      });
      const screen = await renderScreen();
      expect(screen.queryByTestId('wallet-screen-faucet')).toBeNull();
    });

    it('hides the faucet button while no wallet is linked', async () => {
      mockedUseWallet.mockReturnValue({
        data: {
          publicKey: null,
          usdcAta: null,
          balanceMicro: '0',
          skrDomain: null,
          isSeeker: false,
        },
        isLoading: false,
      } as never);
      const screen = await renderScreen();
      expect(screen.queryByTestId('wallet-screen-faucet')).toBeNull();
    });

    it('labels the faucet button and keeps its name while the claim spinner shows', async () => {
      const idle = await renderScreen();
      const idleButton = idle.getByTestId('wallet-screen-faucet');
      expect(idleButton.props.accessibilityRole).toBe('button');
      expect(idleButton.props.accessibilityLabel).toBe('Get test USDC');
      expect(idleButton.props.accessibilityState).toEqual({ busy: false, disabled: false });

      mockClaimPending = true;
      const pending = await renderScreen();
      expect(pending.queryByText('Get test USDC')).toBeNull();
      const pendingButton = pending.getByTestId('wallet-screen-faucet');
      expect(pendingButton.props.accessibilityLabel).toBe('Get test USDC');
      expect(pendingButton.props.accessibilityState).toEqual({ busy: true, disabled: true });
    });

    it('claims test USDC and shows the result under the button', async () => {
      mockClaimMutate.mockImplementation((_vars: unknown, opts: { onSuccess?: () => void }) =>
        opts.onSuccess?.(),
      );
      const screen = await renderScreen();
      await fireEvent.press(screen.getByTestId('wallet-screen-faucet'));
      expect(mockClaimMutate).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('wallet-screen-faucet-status')).toBeTruthy();
      expect(screen.getByText('Test USDC sent')).toBeTruthy();
    });

    it('clears the result after 4 s', async () => {
      jest.useFakeTimers();
      try {
        mockClaimMutate.mockImplementation((_vars: unknown, opts: { onSuccess?: () => void }) =>
          opts.onSuccess?.(),
        );
        const screen = await renderScreen();
        await fireEvent.press(screen.getByTestId('wallet-screen-faucet'));
        expect(screen.getByTestId('wallet-screen-faucet-status')).toBeTruthy();
        await act(async () => {
          jest.advanceTimersByTime(4000);
        });
        expect(screen.queryByTestId('wallet-screen-faucet-status')).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });

    it('explains the faucet cooldown', async () => {
      failClaimWith(new ApiMutationError(429, { code: 'faucet_cooldown' }));
      const screen = await renderScreen();
      await fireEvent.press(screen.getByTestId('wallet-screen-faucet'));
      expect(screen.getByText('You can claim test USDC again tomorrow.')).toBeTruthy();
    });

    it.each(['faucet_empty', 'faucet_wrong_cluster'])(
      'reports %s as the faucet being unavailable',
      async (code) => {
        failClaimWith(new ApiMutationError(503, { code }));
        const screen = await renderScreen();
        await fireEvent.press(screen.getByTestId('wallet-screen-faucet'));
        expect(screen.getByText('The test faucet is empty right now.')).toBeTruthy();
      },
    );

    it('says nothing for a double tap while a claim is in flight (409 faucet_in_flight)', async () => {
      failClaimWith(new ApiMutationError(409, { code: 'faucet_in_flight' }));
      const screen = await renderScreen();
      await fireEvent.press(screen.getByTestId('wallet-screen-faucet'));
      expect(screen.queryByTestId('wallet-screen-faucet-status')).toBeNull();
    });

    it('prompts to connect when the server has no linked wallet (400 wallet_not_linked)', async () => {
      failClaimWith(new ApiMutationError(400, { code: 'wallet_not_linked' }));
      const screen = await renderScreen();
      await fireEvent.press(screen.getByTestId('wallet-screen-faucet'));
      expect(screen.getByText('Connect your Solana wallet')).toBeTruthy();
    });
  });
});
