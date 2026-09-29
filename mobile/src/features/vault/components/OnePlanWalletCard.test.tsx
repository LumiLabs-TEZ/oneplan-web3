import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { OnePlanWalletCard } from './OnePlanWalletCard';

describe('OnePlanWalletCard', () => {
  beforeAll(() => {
    initI18n();
  });

  it('shows the balance and formats whole USDC without decimals', async () => {
    const screen = await render(
      <OnePlanWalletCard
        email="user@example.com"
        balanceUsdc={120}
        balanceVnd={3_157_620}
      />,
    );
    expect(screen.getByText('user@example.com')).toBeTruthy();
    expect(screen.getByText('120')).toBeTruthy();
    expect(screen.getByText('3,157,620 VND')).toBeTruthy();
  });

  it('shows two decimal places for a non-whole balance', async () => {
    const screen = await render(
      <OnePlanWalletCard email="a@b.com" balanceUsdc={12.5} balanceVnd={0} />,
    );
    expect(screen.getByText('12.50')).toBeTruthy();
  });

  it('shows an em dash when the email is blank', async () => {
    const screen = await render(<OnePlanWalletCard email="" balanceUsdc={0} balanceVnd={0} />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('shows a spinner instead of the balance while loading', async () => {
    const screen = await render(
      <OnePlanWalletCard email="a@b.com" balanceUsdc={10} balanceVnd={0} isLoading testID="card" />,
    );
    expect(screen.queryByText('10')).toBeNull();
  });

  it('fires onOpenDetail, onWithdraw, and onDeposit as three independent taps', async () => {
    const onOpenDetail = jest.fn();
    const onWithdraw = jest.fn();
    const onDeposit = jest.fn();
    const screen = await render(
      <OnePlanWalletCard
        email="a@b.com"
        balanceUsdc={10}
        balanceVnd={0}
        onOpenDetail={onOpenDetail}
        onWithdraw={onWithdraw}
        onDeposit={onDeposit}
        testID="card"
      />,
    );

    await fireEvent.press(screen.getByTestId('card-open'));
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
    expect(onWithdraw).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('card-withdraw'));
    expect(onWithdraw).toHaveBeenCalledTimes(1);
    expect(onOpenDetail).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByTestId('card-deposit'));
    expect(onDeposit).toHaveBeenCalledTimes(1);
  });
});
