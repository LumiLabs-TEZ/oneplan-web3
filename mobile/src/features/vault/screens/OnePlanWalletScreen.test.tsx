import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { useWallet, useWalletHistory } from '../api/queries';
import { OnePlanWalletScreen } from './OnePlanWalletScreen';

jest.mock('../api/queries');

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
});
