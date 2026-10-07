/**
 * Port of the amount/balance/prefill behaviours in `VaultPayAmountView.swift` (`feat/web3-version`).
 */
import { fireEvent, render } from '@testing-library/react-native';

import { VaultPayAmountScreen } from './VaultPayAmountScreen';

// Rendered without a SafeAreaProvider; the screen reads the top inset for its header.
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

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
    expect(screen.getByText('Balance đ5,000,000')).toBeTruthy();
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

  it('a QR-carried amount is fixed: no keypad, just the locked note', async () => {
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
    expect(screen.getByTestId('vault-pay-amount-locked')).toHaveTextContent(
      'This QR code sets the amount.',
    );
    expect(screen.queryByTestId('key-1')).toBeNull();
  });

  it('a static QR (no amount) keeps the keypad', async () => {
    const screen = await render(
      <VaultPayAmountScreen
        recipientName="Nguyen Van A"
        balanceVnd={5_000_000}
        prefilledAmountVnd={null}
        indicativeRate={26_500}
        onBack={jest.fn()}
        onNext={jest.fn()}
      />,
    );
    expect(screen.getByTestId('key-1')).toBeTruthy();
    expect(screen.queryByTestId('vault-pay-amount-locked')).toBeNull();
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

  it('over the group balance: tints the amount but still allows Next (payer is picked next)', async () => {
    const onNext = jest.fn();
    const screen = await render(
      <VaultPayAmountScreen
        recipientName="Nguyen Van A"
        balanceVnd={100}
        prefilledAmountVnd={200n}
        indicativeRate={26_500}
        onBack={jest.fn()}
        onNext={onNext}
      />,
    );
    expect(screen.queryByText('Insufficient balance')).toBeNull();
    expect(screen.getByTestId('vault-pay-amount-next').props.accessibilityState).toEqual({
      disabled: false,
    });
    await fireEvent.press(screen.getByTestId('vault-pay-amount-next'));
    expect(onNext).toHaveBeenCalledWith('200');
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
    await fireEvent.press(screen.getByTestId('vault-pay-amount-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
