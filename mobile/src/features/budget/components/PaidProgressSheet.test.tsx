import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';
import { CURRENCIES } from '@/lib/currency';

import { PaidProgressSheet, type PaidProgressItem } from './PaidProgressSheet';

const items: PaidProgressItem[] = [
  {
    id: '1:1',
    budgetId: 1,
    paymentId: 1,
    title: 'Hotel',
    amount: 1_000_000,
    currency: CURRENCIES.VND,
    isPaid: true,
  },
  {
    id: '2:2',
    budgetId: 2,
    paymentId: 2,
    title: 'Food',
    amount: 500_000,
    currency: CURRENCIES.VND,
    isPaid: false,
  },
];

describe('PaidProgressSheet', () => {
  beforeAll(() => {
    initI18n();
  });

  it('fires onToggle when the viewer can toggle', async () => {
    const onToggle = jest.fn();
    const screen = await render(<PaidProgressSheet items={items} canToggle onToggle={onToggle} />);
    expect(screen.getByRole('text', { name: '500,000đ' })).toBeTruthy();
    await fireEvent.press(screen.getByTestId('paid-progress-row-2:2'));
    expect(onToggle).toHaveBeenCalledWith(items[1]);
  });

  it('disables rows and never fires onToggle when read-only', async () => {
    const onToggle = jest.fn();
    const screen = await render(
      <PaidProgressSheet items={items} canToggle={false} onToggle={onToggle} />,
    );
    expect(screen.getByTestId('paid-progress-row-2:2').props.accessibilityState.disabled).toBe(
      true,
    );
    await fireEvent.press(screen.getByTestId('paid-progress-row-2:2'));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
