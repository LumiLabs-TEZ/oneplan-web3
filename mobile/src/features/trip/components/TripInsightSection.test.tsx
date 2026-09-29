import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import React from 'react';

import { initI18n, setAppLanguage } from '@/i18n';
import { CURRENCIES } from '@/lib/currency';
import { useSettingsStore } from '@/stores/settingsStore';

import type { BudgetDto, ExpenseSummaryDto, TripBreakdownDto } from '../types';
import { TripInsightSection } from './TripInsightSection';

function Wrapper({ children }: { children: ReactNode }) {
  const [client] = React.useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function expense(
  id: number,
  amount: number,
  category: ExpenseSummaryDto['category'],
): ExpenseSummaryDto {
  return {
    id,
    name: `Expense ${id}`,
    amount,
    category,
    expenseDate: '2026-03-10',
    createdAt: '2026-03-10T08:00:00.000Z',
    sharedMembers: [],
  };
}

const breakdown: TripBreakdownDto = {
  totalSpent: 500_000,
  unsettledCount: 0,
  members: [
    {
      userId: 1,
      displayName: 'Me',
      avatarUrl: null,
      totalDeposit: 0,
      totalPaid: 0,
      totalShare: 300_000,
      netBalance: -50_000,
      isAllSettled: false,
      expenses: [
        { expenseId: 1, expenseName: 'Dinner', shareAmount: 300_000, isSettled: false, shareId: 1 },
      ],
    },
    {
      userId: 2,
      displayName: 'Friend',
      avatarUrl: null,
      totalDeposit: 0,
      totalPaid: 0,
      totalShare: 200_000,
      netBalance: 50_000,
      isAllSettled: true,
      expenses: [],
    },
  ],
};

const expenses = [expense(1, 300_000, 'FOOD'), expense(2, 200_000, 'OTHER')];
const budgets: BudgetDto[] = [];

describe('TripInsightSection', () => {
  beforeAll(() => {
    initI18n();
  });

  afterEach(async () => {
    await act(async () => {
      useSettingsStore.setState({ language: 'en' });
    });
  });

  it('defaults to Personal and switches scope on toggle press', async () => {
    const screen = await render(
      <Wrapper>
        <TripInsightSection
          breakdown={breakdown}
          expenses={expenses}
          budgets={budgets}
          currency={CURRENCIES.VND}
          currentUserId={1}
        />
      </Wrapper>,
    );

    expect(screen.getByTestId('insight-personal-remaining')).toBeTruthy();
    expect(screen.queryByTestId('insight-group-remaining')).toBeNull();

    await fireEvent.press(screen.getByTestId('insight-scope-group'));

    expect(screen.queryByTestId('insight-personal-remaining')).toBeNull();
    expect(screen.getByTestId('insight-group-remaining')).toBeTruthy();
  });

  it('renders personal tile values from totalShare and netBalance', async () => {
    const screen = await render(
      <Wrapper>
        <TripInsightSection
          breakdown={breakdown}
          expenses={expenses}
          budgets={budgets}
          currency={CURRENCIES.VND}
          currentUserId={1}
        />
      </Wrapper>,
    );

    expect(screen.getByRole('text', { name: '-50,000 đ' })).toBeTruthy(); // remaining
    expect(screen.getByRole('text', { name: '300,000 đ' })).toBeTruthy(); // your expenses
  });

  it('hides zero-amount categories', async () => {
    const screen = await render(
      <Wrapper>
        <TripInsightSection
          breakdown={breakdown}
          expenses={expenses}
          budgets={budgets}
          currency={CURRENCIES.VND}
          currentUserId={1}
        />
      </Wrapper>,
    );

    // Personal only spent on FOOD (300,000 shareAmount) — STAY etc. never render.
    expect(screen.getByTestId('category-spend-row-FOOD')).toBeTruthy();
    expect(screen.queryByTestId('category-spend-row-STAY')).toBeNull();
  });

  // `PersonalScope`/`GroupScope` call `t` in their own function bodies, so each
  // must subscribe to the language store (`useAppLanguage`) — otherwise the
  // React Compiler memoises their output and a language switch leaves stale text.
  it('re-renders the scope subtrees when the app language changes', async () => {
    const screen = await render(
      <Wrapper>
        <TripInsightSection
          breakdown={breakdown}
          expenses={expenses}
          budgets={budgets}
          currency={CURRENCIES.VND}
          currentUserId={1}
        />
      </Wrapper>,
    );

    expect(screen.getByText('Your expenses')).toBeTruthy();

    await act(async () => {
      setAppLanguage('vi');
    });

    expect(screen.getByText('Chi phí của bạn')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('insight-scope-group'));
    expect(screen.getByText('Chi phí thành viên')).toBeTruthy();
  });

  it("only expands the current user's row in the group member list", async () => {
    const screen = await render(
      <Wrapper>
        <TripInsightSection
          breakdown={breakdown}
          expenses={expenses}
          budgets={budgets}
          currency={CURRENCIES.VND}
          currentUserId={1}
        />
      </Wrapper>,
    );

    await fireEvent.press(screen.getByTestId('insight-scope-group'));

    expect(screen.getByTestId('member-expense-breakdown-1-toggle')).toBeTruthy();
    expect(screen.queryByTestId('member-expense-breakdown-2-toggle')).toBeNull();
  });
});
