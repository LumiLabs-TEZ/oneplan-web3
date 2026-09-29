import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { WalletWithdrawResultScreen } from './WalletWithdrawResultScreen';

const baseResult = {
  amountMicro: 20_000_000n,
  recipient: '0xd3abcdadg7xyz',
  signature: 'h42fjh24abcd',
  date: new Date(2026, 0, 1, 8, 30),
};

describe('WalletWithdrawResultScreen', () => {
  beforeAll(() => {
    initI18n();
  });

  it('shows Completed status and a Send again button', async () => {
    const onSendAgain = jest.fn();
    const screen = await render(
      <WalletWithdrawResultScreen
        result={{ ...baseResult, status: 'completed' }}
        onDone={jest.fn()}
        onSendAgain={onSendAgain}
      />,
    );
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByText('$20')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('withdraw-result-send-again'));
    expect(onSendAgain).toHaveBeenCalledTimes(1);
  });

  it('shows Processing status with no Send again button (never shown as failed)', async () => {
    const screen = await render(
      <WalletWithdrawResultScreen
        result={{ ...baseResult, status: 'processing' }}
        onDone={jest.fn()}
      />,
    );
    expect(screen.getByText('Processing')).toBeTruthy();
    expect(screen.queryByTestId('withdraw-result-send-again')).toBeNull();
  });

  it('shows Failed status', async () => {
    const screen = await render(
      <WalletWithdrawResultScreen
        result={{ ...baseResult, status: 'failed' }}
        onDone={jest.fn()}
      />,
    );
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('every fee line reads "Covered", never a computed number', async () => {
    const screen = await render(
      <WalletWithdrawResultScreen
        result={{ ...baseResult, status: 'completed' }}
        onDone={jest.fn()}
      />,
    );
    expect(screen.getAllByText('Covered')).toHaveLength(2);
  });

  it('Go back calls onDone', async () => {
    const onDone = jest.fn();
    const screen = await render(
      <WalletWithdrawResultScreen
        result={{ ...baseResult, status: 'completed' }}
        onDone={onDone}
      />,
    );
    await fireEvent.press(screen.getByTestId('withdraw-result-go-back'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
