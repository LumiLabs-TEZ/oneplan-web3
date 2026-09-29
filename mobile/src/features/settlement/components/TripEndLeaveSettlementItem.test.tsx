import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';
import { CURRENCIES } from '@/lib/currency';

import type { LeaveSettlementDto } from '../types';
import { TripEndLeaveSettlementItem } from './TripEndLeaveSettlementItem';

function settlement(over: Partial<LeaveSettlementDto> = {}): LeaveSettlementDto {
  return {
    displayName: 'Ken',
    totalBudgetRefund: 500_000,
    totalExpenseShare: 200_000,
    netSettlement: 300_000,
    expenses: [
      { expenseName: 'Dinner', shareAmount: 150_000, isSettled: false },
      { expenseName: 'Taxi', shareAmount: 50_000, isSettled: true },
    ],
    ...over,
  };
}

const props = { currency: CURRENCIES.VND, avatarUrl: null, onMarkAsDone: jest.fn() };

describe('TripEndLeaveSettlementItem', () => {
  beforeAll(() => {
    initI18n();
  });

  it('is expanded by default and collapses on the toggle', async () => {
    const screen = await render(
      <TripEndLeaveSettlementItem {...props} settlement={settlement()} />,
    );
    expect(screen.getByTestId('leave-settlement-body')).toBeTruthy();
    expect(screen.getAllByTestId('leave-expense-row')).toHaveLength(2);

    await fireEvent.press(screen.getByTestId('leave-settlement-toggle'));
    expect(screen.queryByTestId('leave-settlement-body')).toBeNull();
  });

  it('shows the total share and the "(to receive)" net when money is owed to the leaver', async () => {
    const screen = await render(
      <TripEndLeaveSettlementItem {...props} settlement={settlement()} />,
    );
    expect(screen.getByText('200,000')).toBeTruthy();
    expect(screen.getByTestId('leave-net-label')).toHaveTextContent('+300,000 (to receive)');
    expect(screen.getByText('Receive from group')).toBeTruthy();
  });

  it('shows "(to send)" and the pay-to-group row when the leaver owes', async () => {
    const screen = await render(
      <TripEndLeaveSettlementItem
        {...props}
        settlement={settlement({ netSettlement: -120_000 })}
      />,
    );
    expect(screen.getByTestId('leave-net-label')).toHaveTextContent('-120,000 (to send)');
    expect(screen.getByText('Pay to group')).toBeTruthy();
  });

  it('says All Settled and hides the action when nothing is open', async () => {
    const screen = await render(
      <TripEndLeaveSettlementItem
        {...props}
        settlement={settlement({
          netSettlement: 0,
          expenses: [{ expenseName: 'Dinner', shareAmount: 10, isSettled: true }],
        })}
      />,
    );
    expect(screen.getByTestId('leave-net-label')).toHaveTextContent('All Settled');
    expect(screen.queryByTestId('leave-settlement-action')).toBeNull();
    expect(screen.queryByTestId('leave-net-row')).toBeNull();
  });

  it('Mark as Done opens the confirm sheet whose confirm only calls back', async () => {
    const onMarkAsDone = jest.fn();
    const screen = await render(
      <TripEndLeaveSettlementItem
        {...props}
        onMarkAsDone={onMarkAsDone}
        settlement={settlement()}
      />,
    );
    await fireEvent.press(screen.getByTestId('leave-settlement-action'));
    expect(screen.getByTestId('trip-end-confirm-sheet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('trip-end-confirm-button'));
    expect(onMarkAsDone).toHaveBeenCalledTimes(1);
  });

  it('hides the budget refund row when there is nothing to refund', async () => {
    const screen = await render(
      <TripEndLeaveSettlementItem {...props} settlement={settlement({ totalBudgetRefund: 0 })} />,
    );
    expect(screen.queryByText('Total Paid Budget')).toBeNull();
  });
});
