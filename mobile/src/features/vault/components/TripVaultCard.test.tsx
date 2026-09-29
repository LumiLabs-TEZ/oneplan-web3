import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { TripVaultCard } from './TripVaultCard';

describe('TripVaultCard', () => {
  beforeAll(() => {
    initI18n();
  });

  it('shows Deposit + Scan QR by default and fires their callbacks', async () => {
    const onDeposit = jest.fn();
    const onScanQR = jest.fn();
    const screen = await render(
      <TripVaultCard
        tripName="Dubai 2025"
        balance={10_000_000}
        currency="VND"
        balanceUsdc={450}
        onDeposit={onDeposit}
        onScanQR={onScanQR}
      />,
    );

    expect(screen.getByText('Dubai 2025')).toBeTruthy();
    expect(screen.getByText('Group Balance')).toBeTruthy();
    expect(screen.queryByTestId('trip-vault-card-waiting')).toBeNull();

    await fireEvent.press(screen.getByTestId('trip-vault-card-deposit'));
    expect(onDeposit).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByTestId('trip-vault-card-scan-qr'));
    expect(onScanQR).toHaveBeenCalledTimes(1);
  });

  it('replaces the action row with a single Waiting-for-approval CTA', async () => {
    const onWaitingForApproval = jest.fn();
    const screen = await render(
      <TripVaultCard
        tripName="Dubai 2025"
        balance={0}
        currency="VND"
        balanceUsdc={0}
        isWaitingForEndApproval
        onWaitingForApproval={onWaitingForApproval}
      />,
    );

    expect(screen.queryByTestId('trip-vault-card-deposit')).toBeNull();
    expect(screen.queryByTestId('trip-vault-card-scan-qr')).toBeNull();

    await fireEvent.press(screen.getByTestId('trip-vault-card-waiting'));
    expect(onWaitingForApproval).toHaveBeenCalledTimes(1);
  });

  it('formats the USDC line with formatUsdc, not the fiat 2-place split', async () => {
    const screen = await render(
      <TripVaultCard tripName="Trip" balance={0} currency="VND" balanceUsdc={0.999} />,
    );
    // formatWhole(0.999) + formatDecimal(0.999) would read "0.100" — formatUsdc must not.
    expect(screen.getByText('1.00 USDC')).toBeTruthy();
  });

  it('accepts a resolved catalog Currency as well as a code', async () => {
    const screen = await render(
      <TripVaultCard
        tripName="Trip"
        balance={12.5}
        currency={{ code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 }}
        balanceUsdc={12.5}
      />,
    );
    expect(screen.getByText('$')).toBeTruthy();
  });
});
