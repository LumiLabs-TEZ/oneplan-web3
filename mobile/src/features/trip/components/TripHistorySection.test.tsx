import { fireEvent, render, screen } from '@testing-library/react-native';

import type { HistorySection } from '@/features/trip/helpers/historyEntries';
import { initI18n } from '@/i18n';
import { CURRENCIES } from '@/lib/currency';

import { formatTime } from './TripHistoryList';
import { TripHistorySection } from './TripHistorySection';

const sections: HistorySection[] = [
  {
    dateKey: '2026-03-10',
    label: 'Today',
    entries: [
      {
        kind: 'expense',
        id: 11,
        name: 'Lẩu bò Nhà Gỗ',
        category: 'FOOD',
        amountLabel: '-1,955,000đ',
        amount: 1955000,
        amountSign: '-',
        amountCurrency: CURRENCIES.VND,
        scope: { type: 'all' },
        payer: { type: 'group' },
        sortDate: '2026-03-10T12:07:00.000Z',
        dateKey: '2026-03-10',
      },
      {
        kind: 'budget',
        id: 5,
        name: 'Trip Fund',
        amountLabel: '+19,000,000đ',
        amount: 19000000,
        amountSign: '+',
        amountCurrency: CURRENCIES.VND,
        fxLabel: '~760.00 USD',
        fx: { amount: 760, currency: CURRENCIES.USD },
        scope: {
          type: 'members',
          avatars: [
            { userId: 1, avatarUrl: null },
            { userId: 2, avatarUrl: null },
            { userId: 3, avatarUrl: null },
          ],
        },
        payer: null,
        sortDate: '2026-03-10T05:00:00.000Z',
        dateKey: '2026-03-10',
      },
    ],
  },
  {
    dateKey: '2026-03-08',
    label: 'Mar 8',
    entries: [
      {
        kind: 'expense',
        id: 12,
        name: 'Homestay',
        category: 'STAY',
        amountLabel: '-5,000,000đ',
        amount: 5000000,
        amountSign: '-',
        amountCurrency: CURRENCIES.VND,
        scope: { type: 'members', avatars: [{ userId: 2, avatarUrl: 'https://cdn/mai.png' }] },
        payer: { type: 'member', displayName: 'Hyydesi', avatarUrl: null },
        sortDate: '2026-03-08T05:03:00.000Z',
        dateKey: '2026-03-08',
      },
    ],
  },
];

describe('TripHistorySection', () => {
  beforeAll(() => {
    initI18n();
  });

  it('shows a spinner while loading with no data', async () => {
    await render(<TripHistorySection sections={[]} isLoading onExpensePress={jest.fn()} />);
    expect(screen.getByTestId('history-loading')).toBeTruthy();
    expect(screen.queryByTestId('history-empty')).toBeNull();
    expect(screen.queryByText('No history')).toBeNull();
  });

  it('shows the empty card when there is no history', async () => {
    await render(<TripHistorySection sections={[]} isLoading={false} onExpensePress={jest.fn()} />);
    expect(screen.getByText('No history')).toBeTruthy();
    expect(screen.getByText('Add a budget or expense to get started')).toBeTruthy();
  });

  it('renders headers, rows, pills and amounts', async () => {
    const onExpensePress = jest.fn();
    const onBudgetPress = jest.fn();
    await render(
      <TripHistorySection
        sections={sections}
        isLoading={false}
        onExpensePress={onExpensePress}
        onBudgetPress={onBudgetPress}
      />,
    );

    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Mar 8')).toBeTruthy();
    expect(screen.getByRole('text', { name: '-1,955,000đ' })).toBeTruthy();
    expect(screen.getByRole('text', { name: '+19,000,000đ' })).toBeTruthy();
    expect(screen.getByRole('text', { name: '~760.00 USD' })).toBeTruthy();
    expect(screen.getByText('Group')).toBeTruthy();
    expect(screen.getByText('All')).toBeTruthy();
    expect(screen.getByText('Hyydesi')).toBeTruthy();
    expect(screen.getByText('+1')).toBeTruthy();
    // Every section renders, not just those a virtualized viewport happened to measure.
    expect(screen.getAllByTestId('history-header')).toHaveLength(2);
    expect(screen.getByTestId('history-row-expense-12')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('history-row-expense-11'));
    expect(onExpensePress).toHaveBeenCalledWith(11);
    await fireEvent.press(screen.getByTestId('history-row-budget-5'));
    expect(onBudgetPress).toHaveBeenCalledWith(5);
  });

  it('blocks expense taps when expensePressDisabled (offline)', async () => {
    const onExpensePress = jest.fn();
    await render(
      <TripHistorySection
        sections={sections}
        isLoading={false}
        onExpensePress={onExpensePress}
        expensePressDisabled
      />,
    );
    await fireEvent.press(screen.getByTestId('history-row-expense-11'));
    expect(onExpensePress).not.toHaveBeenCalled();
  });

  it('formats row times in the device clock style', () => {
    const iso = new Date(2026, 2, 10, 13, 55).toISOString();
    expect(formatTime(iso, 'en', false)).toBe('1:55 PM');
    expect(formatTime(iso, 'en', true)).toBe('13:55');
    expect(formatTime('not-a-date', 'en', true)).toBe('');
  });
});
