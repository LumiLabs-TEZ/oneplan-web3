import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

let mockWalletData: { balanceMicro: string } | undefined = { balanceMicro: '10000000' };
const mockWalletLoading = { current: false };
jest.mock('../api/queries', () => ({
  useMyVaultWallet: () => ({ data: mockWalletData, isLoading: mockWalletLoading.current }),
}));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

// eslint-disable-next-line import/first -- must follow the jest.mock hoist target
import { ContributeToVaultSheet } from './ContributeToVaultSheet';

describe('ContributeToVaultSheet', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    mockWalletData = { balanceMicro: '10000000' };
    mockWalletLoading.current = false;
  });

  it('keeps the submit button disabled with an empty amount', async () => {
    const screen = await render(
      <ContributeToVaultSheet tripId={5} onContribute={jest.fn()} />,
    );
    expect(screen.getByTestId('contribute-submit').props.accessibilityState.disabled).toBe(true);
  });

  it('enables submit for a valid amount within balance, and calls onContribute with micro-USDC', async () => {
    const onContribute = jest.fn();
    const screen = await render(
      <ContributeToVaultSheet tripId={5} onContribute={onContribute} />,
    );

    await fireEvent.press(screen.getByTestId('key-5'));
    expect(screen.getByText('$5')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('contribute-submit'));
    expect(onContribute).toHaveBeenCalledWith(5_000_000n);
  });

  it('shows Insufficient balance and keeps submit disabled when the amount exceeds the wallet balance', async () => {
    mockWalletData = { balanceMicro: '1000000' }; // $1
    const screen = await render(
      <ContributeToVaultSheet tripId={5} onContribute={jest.fn()} />,
    );

    await fireEvent.press(screen.getByTestId('key-5'));
    expect(screen.getByText('Insufficient balance')).toBeTruthy();
    expect(screen.getByTestId('contribute-submit').props.accessibilityState.disabled).toBe(true);
  });

  it('locks the amount and hides the keypad when locksAmount is set (leave-settle handoff)', async () => {
    const screen = await render(
      <ContributeToVaultSheet
        tripId={5}
        prefilledAmountMicro={2_500_000n}
        locksAmount
        onContribute={jest.fn()}
      />,
    );
    expect(screen.getByText('$2.50')).toBeTruthy();
    expect(screen.getByText('Amount is fixed to clear your leave balance.')).toBeTruthy();
    expect(screen.queryByTestId('amount-keypad')).toBeNull();
  });
});
