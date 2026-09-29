/**
 * Port of the amount/balance/prefill behaviours in `VaultPayAmountView.swift` (`feat/web3-version`).
 */
import { fireEvent, render } from '@testing-library/react-native';

import { VaultPayAmountScreen } from './VaultPayAmountScreen';

describe('VaultPayAmountScreen', () => {
  it('starts empty, disables Next, and shows the recipient + balance', async () => {
    const screen = await render(
      <VaultPayAmountScreen
        recipientName="…"
        balanceVnd={5_000_000}
        indicativeRate={26_500}
        onBack={jest.fn()}
        onNext={jest.fn()}
      />,
    );
    expect(screen.getByTestId('vault-pay-amount-display')).toHaveTextContent('0');
    expect(screen.getByTestId('vault-pay-amount-recipient')).toHaveTextContent('…');
    expect(screen.getByText('đ5,000,000')).toBeTruthy();
    expect(screen.getByTestId('vault-pay-amount-next').props.accessibilityState).toEqual({
      disabled: true,
    });
  });

  it('prefills from the QR-carried amount only once, on mount', async () => {
    const screen = await render(
      <VaultPayAmountScreen
        recipientName="Nguyen Van A"
        balanceVnd={5_000_000}
        prefilledAmountVnd={200_000n}
        indicativeRate={26_500}
        onBack={jest.fn()}
        onNext={jest.fn()}
      />,
    );
    expect(screen.getByTestId('vault-pay-amount-display')).toHaveTextContent('200,000');
  });

  it('typing digits live-formats the amount and enables Next', async () => {
    const screen = await render(
      <VaultPayAmountScreen
        recipientName="Nguyen Van A"
        balanceVnd={5_000_000}
        indicativeRate={26_500}
        onBack={jest.fn()}
        onNext={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByTestId('key-2'));
    await fireEvent.press(screen.getByTestId('key-0'));
    await fireEvent.press(screen.getByTestId('key-0'));
    expect(screen.getByTestId('vault-pay-amount-display')).toHaveTextContent('200');
    expect(screen.getByTestId('vault-pay-amount-next').props.accessibilityState).toEqual({
      disabled: false,
    });
  });

  it('over the balance cap: shows "Insufficient balance" and disables Next', async () => {
    const screen = await render(
      <VaultPayAmountScreen
        recipientName="Nguyen Van A"
        balanceVnd={100}
        prefilledAmountVnd={200n}
        indicativeRate={26_500}
        onBack={jest.fn()}
        onNext={jest.fn()}
      />,
    );
    expect(screen.getByText('Insufficient balance')).toBeTruthy();
    expect(screen.getByTestId('vault-pay-amount-next').props.accessibilityState).toEqual({
      disabled: true,
    });
  });

  it('a personal-wallet cap larger than the vault balance is not flagged insufficient', async () => {
    const screen = await render(
      <VaultPayAmountScreen
        recipientName="Nguyen Van A"
        balanceVnd={100}
        capVnd={10_000}
        prefilledAmountVnd={5_000n}
        indicativeRate={26_500}
        onBack={jest.fn()}
        onNext={jest.fn()}
      />,
    );
    expect(screen.queryByText('Insufficient balance')).toBeNull();
    expect(screen.getByTestId('vault-pay-amount-next').props.accessibilityState).toEqual({
      disabled: false,
    });
  });

  it('Next reports the raw VND digit string, not a float', async () => {
    const onNext = jest.fn();
    const screen = await render(
      <VaultPayAmountScreen
        recipientName="Nguyen Van A"
        balanceVnd={5_000_000}
        prefilledAmountVnd={200_000n}
        indicativeRate={26_500}
        onBack={jest.fn()}
        onNext={onNext}
      />,
    );
    await fireEvent.press(screen.getByTestId('vault-pay-amount-next'));
    expect(onNext).toHaveBeenCalledWith('200000');
  });

  it('calls onBack from the icon back control', async () => {
    const onBack = jest.fn();
    const screen = await render(
      <VaultPayAmountScreen
        recipientName="…"
        balanceVnd={0}
        indicativeRate={26_500}
        onBack={onBack}
        onNext={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByTestId('vault-pay-amount-back-icon'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
