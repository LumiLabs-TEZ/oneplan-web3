import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { keys } from '@/api/keys';

import type { components } from '@/api/schema';
import { initI18n } from '@/i18n';

import { HomeCard } from './HomeCard';

type BudgetDto = components['schemas']['BudgetDto'];
type ExpenseSummaryDto = components['schemas']['ExpenseSummaryDto'];

function budget(id: number, paidAmount: number, unpaidAmount = 0): BudgetDto {
  const payments: BudgetDto['payments'] = [
    { id: id * 10, userId: 1, displayName: 'Ken', amount: paidAmount, isPaid: true },
  ];
  if (unpaidAmount > 0) {
    payments.push({
      id: id * 10 + 1,
      userId: 2,
      displayName: 'Lan',
      amount: unpaidAmount,
      isPaid: false,
    });
  }
  return {
    id,
    tripId: 1,
    name: `Budget ${id}`,
    amount: paidAmount + unpaidAmount,
    scope: 'GROUP',
    createdAt: '2026-03-10T08:00:00.000Z',
    payments,
  };
}

function expense(id: number, amount: number): ExpenseSummaryDto {
  return {
    id,
    name: `Expense ${id}`,
    amount,
    category: 'FOOD',
    expenseDate: '2026-03-10',
    createdAt: '2026-03-10T08:00:00.000Z',
    sharedMembers: [],
  };
}

const budgets = [budget(1, 1_500_000), budget(2, 500_000, 300_000)];
const expenses = [expense(1, 750_000)];

describe('HomeCard', () => {
  beforeAll(() => {
    initI18n();
  });

  it('shows the balance + usage pill and no flip-side totals', async () => {
    await render(
      <HomeCard
        budgets={budgets}
        expenses={expenses}
        currency="VND"
        canEdit
        tripName="Da Lat"
        onNewExpense={jest.fn()}
      />,
    );
    // balance = totalBudget(2,000,000) - totalSpent(750,000) = 1,250,000
    expect(screen.getByText('Balance')).toBeTruthy();
    expect(screen.getByText('1,250,000')).toBeTruthy();
    expect(screen.getByRole('text', { name: '62%' })).toBeTruthy();
    // The card no longer flips — the old back face (total spent / unsettled) is gone.
    expect(screen.queryByText('Total spent', { includeHiddenElements: true })).toBeNull();
  });

  it('renders decimals for 2-dp currencies', async () => {
    await render(
      <HomeCard
        budgets={[budget(1, 1234.5)]}
        expenses={[]}
        currency="USD"
        canEdit={false}
        tripName="Trip"
        onNewExpense={jest.fn()}
      />,
    );
    // The symbol is its own Text; the number animates with `.50` drawn in the dimmed colour.
    expect(screen.getByText('1,234.50')).toBeTruthy();
    expect(screen.getAllByText('$').length).toBeGreaterThan(0);
  });

  it('fires New expense', async () => {
    const onNewExpense = jest.fn();
    await render(
      <HomeCard
        budgets={budgets}
        expenses={expenses}
        currency="VND"
        canEdit
        tripName="Da Lat"
        onNewExpense={onNewExpense}
      />,
    );
    await fireEvent.press(screen.getByText('New expense'));
    expect(onNewExpense).toHaveBeenCalledTimes(1);
  });

  it('hides the action row when the viewer cannot edit', async () => {
    await render(
      <HomeCard
        budgets={budgets}
        expenses={expenses}
        currency="VND"
        canEdit={false}
        tripName="Da Lat"
        onNewExpense={jest.fn()}
      />,
    );
    expect(screen.queryByText('New expense')).toBeNull();
    expect(screen.queryByText('Add budget')).toBeNull();
  });

  it('fires Add budget when enabled', async () => {
    const onAddBudget = jest.fn();
    await render(
      <HomeCard
        budgets={budgets}
        expenses={expenses}
        currency="VND"
        canEdit
        tripName="Da Lat"
        onNewExpense={jest.fn()}
        onAddBudget={onAddBudget}
      />,
    );
    await fireEvent.press(screen.getByText('Add budget'));
    expect(onAddBudget).toHaveBeenCalledTimes(1);
  });

  it('commits a trimmed rename on blur, but not when the field is emptied', async () => {
    const onRename = jest.fn();
    await render(
      <HomeCard
        budgets={budgets}
        expenses={expenses}
        currency="VND"
        canEdit
        tripName="Da Lat"
        onRename={onRename}
        onNewExpense={jest.fn()}
      />,
    );
    const input = screen.getByTestId('home-card-title-input');
    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, '  Da Lat Trip  ');
    await fireEvent(input, 'blur');
    expect(onRename).toHaveBeenCalledWith('Da Lat Trip');

    onRename.mockClear();
    await fireEvent(input, 'focus');
    await fireEvent.changeText(input, '   ');
    await fireEvent(input, 'blur');
    expect(onRename).not.toHaveBeenCalled();
  });

  it('shows the balance converted into the local currency once the rate is known', async () => {
    const client = new QueryClient();
    client.setQueryData(keys.exchangeRate('VND', 'KRW'), {
      from: 'VND',
      to: 'KRW',
      rate: 0.05,
      fetchedAt: '2026-09-23T00:00:00.000Z',
      isStale: false,
    });
    await render(
      <QueryClientProvider client={client}>
        <HomeCard
          budgets={budgets}
          expenses={expenses}
          currency="VND"
          localCurrency="KRW"
          canEdit
          tripName="Da Lat"
          onNewExpense={jest.fn()}
        />
      </QueryClientProvider>,
    );
    // 1,250,000 VND × 0.05 = 62,500 ₩
    expect(screen.getByRole('text', { name: '~62,500 ₩' })).toBeTruthy();
  });

  it('omits the converted line when the local currency matches or is unset', async () => {
    await render(
      <HomeCard
        budgets={budgets}
        expenses={expenses}
        currency="VND"
        localCurrency="VND"
        canEdit
        tripName="Da Lat"
        onNewExpense={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('home-card-converted-balance')).toBeNull();
  });
});
