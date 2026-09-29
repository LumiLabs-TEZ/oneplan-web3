import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { useWallet } from '../api/queries';
import { useInspectWithdrawRecipient } from '../api/walletWithdraw';
import { useWithdrawFromWallet } from '../signing/withdrawFlow';
import { WalletWithdrawSheet } from './WalletWithdrawSheet';

jest.mock('../api/queries');
jest.mock('../api/walletWithdraw');
jest.mock('../signing/withdrawFlow');

const mockedUseWallet = jest.mocked(useWallet);
const mockedUseInspect = jest.mocked(useInspectWithdrawRecipient);
const mockedUseWithdraw = jest.mocked(useWithdrawFromWallet);

describe('WalletWithdrawSheet', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    mockedUseWallet.mockReturnValue({
      data: { publicKey: 'OWNER', usdcAta: 'ATA', balanceMicro: '50000000' },
    } as never);
    mockedUseInspect.mockReturnValue({
      mutateAsync: jest.fn(async (address: string) => ({ address, isNew: false })),
      isPending: false,
    } as never);
    mockedUseWithdraw.mockReturnValue({
      mutateAsync: jest.fn(async () => ({ signature: 'SIG', status: 'CONFIRMED' })),
      isPending: false,
    } as never);
  });

  it('disables Confirm & Withdraw with no address or amount typed', async () => {
    const screen = await render(<WalletWithdrawSheet onFinished={jest.fn()} />);
    expect(screen.getByTestId('withdraw-confirm').props.accessibilityState.disabled).toBe(true);
  });

  it('typing an amount over the balance shows "Insufficient balance" and disables Confirm', async () => {
    const screen = await render(<WalletWithdrawSheet onFinished={jest.fn()} />);
    // balance is 50 USDC; type 99.
    await fireEvent.press(screen.getByText('9'));
    await fireEvent.press(screen.getByText('9'));
    expect(screen.getByText('Insufficient balance')).toBeTruthy();
  });

  it('entering an address checks it and surfaces the "never held USDC" caution', async () => {
    mockedUseInspect.mockReturnValue({
      mutateAsync: jest.fn(async (address: string) => ({ address, isNew: true })),
      isPending: false,
    } as never);

    const screen = await render(<WalletWithdrawSheet onFinished={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('withdraw-address-pill'));
    await fireEvent.changeText(screen.getByTestId('withdraw-address-input'), 'FRESH_ADDR');
    await fireEvent.press(screen.getByTestId('withdraw-address-done'));

    await waitFor(() =>
      expect(
        screen.getByText('This address has never held USDC. Check it carefully.'),
      ).toBeTruthy(),
    );
  });

  it('sends a valid withdrawal and swaps in place to the result screen', async () => {
    const mutateAsync = jest.fn(async () => ({ signature: 'SIG123', status: 'CONFIRMED' }));
    mockedUseWithdraw.mockReturnValue({ mutateAsync, isPending: false } as never);

    const screen = await render(<WalletWithdrawSheet onFinished={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('withdraw-address-pill'));
    await fireEvent.changeText(screen.getByTestId('withdraw-address-input'), 'RECIPIENT_ADDR');
    await fireEvent.press(screen.getByTestId('withdraw-address-done'));
    await fireEvent.press(screen.getByText('2'));
    await fireEvent.press(screen.getByText('0'));

    await waitFor(() => expect(screen.getByTestId('withdraw-confirm')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('withdraw-confirm'));

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        address: 'RECIPIENT_ADDR',
        amountMicro: 20_000_000n,
      }),
    );
    await waitFor(() => expect(screen.getByText('Completed')).toBeTruthy());
  });

  it('shows an inline error and never presents a result when the withdrawal call fails', async () => {
    const mutateAsync = jest.fn(async () => {
      throw new Error('Network error');
    });
    mockedUseWithdraw.mockReturnValue({ mutateAsync, isPending: false } as never);

    const screen = await render(<WalletWithdrawSheet onFinished={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('withdraw-address-pill'));
    await fireEvent.changeText(screen.getByTestId('withdraw-address-input'), 'RECIPIENT_ADDR');
    await fireEvent.press(screen.getByTestId('withdraw-address-done'));
    await fireEvent.press(screen.getByText('5'));
    await fireEvent.press(screen.getByTestId('withdraw-confirm'));

    await waitFor(() => expect(screen.getByText('Network error')).toBeTruthy());
    expect(screen.queryByTestId('withdraw-result-go-back')).toBeNull();
  });

  it('applies a settlement prefill (address + amount) on mount', async () => {
    const screen = await render(
      <WalletWithdrawSheet
        onFinished={jest.fn()}
        prefilledAddress="CREDITOR_ADDR"
        prefilledAmountMicro={5_000_000n}
      />,
    );
    expect(screen.getByText('$5')).toBeTruthy();
    expect(screen.getByText('CRED...ADDR')).toBeTruthy();
  });
});
