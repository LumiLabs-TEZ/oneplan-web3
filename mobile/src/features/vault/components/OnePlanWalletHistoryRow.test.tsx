import { render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { OnePlanWalletHistoryRow } from './OnePlanWalletHistoryRow';

describe('OnePlanWalletHistoryRow', () => {
  beforeAll(() => {
    initI18n();
  });

  it('renders a withdraw row with a minus amount and warning tint', async () => {
    const screen = await render(
      <OnePlanWalletHistoryRow
        entry={{
          id: '1',
          kind: 'withdraw',
          address: 'D3ade7xyzabcdefghijklmnop',
          amountUsdc: 20,
          time: '08:20',
        }}
      />,
    );
    expect(screen.getByText('Withdraw USDC')).toBeTruthy();
    expect(screen.getByText('-$20')).toBeTruthy();
    expect(screen.getByText('D3ad...mnop')).toBeTruthy();
  });

  it('renders a deposit row with a plus amount', async () => {
    const screen = await render(
      <OnePlanWalletHistoryRow
        entry={{
          id: '2',
          kind: 'deposit',
          address: 'D3ade7xyzabcdefghijklmnop',
          amountUsdc: 100.5,
          time: '08:10',
        }}
      />,
    );
    expect(screen.getByText('Deposit USDC')).toBeTruthy();
    expect(screen.getByText('+$100.50')).toBeTruthy();
  });
});
