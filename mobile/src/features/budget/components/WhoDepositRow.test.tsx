import { fireEvent, render } from '@testing-library/react-native';

import type { DepositRow } from '@/features/budget/helpers/deposits';
import { initI18n } from '@/i18n';
import { CURRENCIES } from '@/lib/currency';

import { WhoDepositRow } from './WhoDepositRow';

const row: DepositRow = {
  userId: 2,
  displayName: 'Linh',
  avatarUrl: null,
  segments: [true, false, true],
  paidAmount: 2_000_000,
  paidCount: 2,
};

describe('WhoDepositRow', () => {
  beforeAll(() => {
    initI18n();
  });

  it('renders the paid amount, "x/y paid" text and fires onPress', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <WhoDepositRow row={row} currency={CURRENCIES.VND} totalBudgetCount={3} onPress={onPress} />,
    );
    expect(screen.getByRole('text', { name: '+2,000,000đ' })).toBeTruthy();
    expect(screen.getByText('2/3 paid')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('deposit-row-2'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
