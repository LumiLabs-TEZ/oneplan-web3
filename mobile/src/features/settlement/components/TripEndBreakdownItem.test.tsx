import { fireEvent, render, within } from '@testing-library/react-native';

import { initI18n } from '@/i18n';
import { CURRENCIES } from '@/lib/currency';
import { colors } from '@/ui/theme';

import type { CounterpartySettlementDto } from '../types';
import { TripEndBreakdownItem } from './TripEndBreakdownItem';

function settlement(over: Partial<CounterpartySettlementDto> = {}): CounterpartySettlementDto {
  return {
    counterpartyUserId: 2,
    displayName: 'Shin',
    avatarUrl: null,
    isGroup: false,
    direction: 'receive',
    totalAmount: 1_500_000,
    isSettled: false,
    items: [
      {
        expenseId: 1,
        expenseName: 'Hotpot',
        shareAmount: 1_000_000,
        isSettled: false,
        shareId: 1,
        owedToYou: true,
      },
      {
        expenseId: 2,
        expenseName: 'Homestay',
        shareAmount: 500_000,
        isSettled: false,
        shareId: 2,
        owedToYou: false,
      },
    ],
    ...over,
  };
}

const props = { currency: CURRENCIES.VND, members: [], onSettle: jest.fn() };

describe('TripEndBreakdownItem', () => {
  beforeAll(() => {
    initI18n();
  });

  it('swaps the receive label when expanded and hides items until then', async () => {
    const screen = await render(<TripEndBreakdownItem {...props} settlement={settlement()} />);
    expect(screen.getByText('Receive from')).toBeTruthy();
    expect(screen.queryByTestId('settlement-row-expanded')).toBeNull();

    await fireEvent.press(screen.getByTestId('settlement-row-header'));
    expect(screen.getByText('You receive from')).toBeTruthy();
    expect(screen.getAllByTestId('settlement-item')).toHaveLength(2);
  });

  it('always labels a pay row Transfer to', async () => {
    const screen = await render(
      <TripEndBreakdownItem {...props} settlement={settlement({ direction: 'pay' })} />,
    );
    expect(screen.getByText('Transfer to')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('settlement-row-header'));
    expect(screen.getByText('Transfer to')).toBeTruthy();
  });

  it('tones item amounts by who owes whom', async () => {
    const screen = await render(<TripEndBreakdownItem {...props} settlement={settlement()} />);
    await fireEvent.press(screen.getByTestId('settlement-row-header'));

    const owed = within(screen.getByRole('text', { name: '+1,000,000đ' })).getByText('1,000,000');
    const owes = within(screen.getByRole('text', { name: '-500,000đ' })).getByText('500,000');
    expect(owed.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: colors.green500 })]),
    );
    expect(owes.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: colors.warning500 })]),
    );
  });

  it('shows "Mark as done" for receive and "Sent" for pay, opening the confirm sheet', async () => {
    const screen = await render(<TripEndBreakdownItem {...props} settlement={settlement()} />);
    await fireEvent.press(screen.getByTestId('settlement-row-header'));
    expect(screen.getByText('Mark as done')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('settlement-row-action'));
    expect(screen.getByTestId('trip-end-confirm-sheet')).toBeTruthy();

    const pay = await render(
      <TripEndBreakdownItem {...props} settlement={settlement({ direction: 'pay' })} />,
    );
    await fireEvent.press(pay.getByTestId('settlement-row-header'));
    expect(pay.getByText('Sent')).toBeTruthy();
  });

  it('confirming settles and collapses the row', async () => {
    const onSettle = jest.fn();
    const screen = await render(
      <TripEndBreakdownItem {...props} onSettle={onSettle} settlement={settlement()} />,
    );
    await fireEvent.press(screen.getByTestId('settlement-row-header'));
    await fireEvent.press(screen.getByTestId('settlement-row-action'));
    await fireEvent.press(screen.getByTestId('trip-end-confirm-button'));

    expect(onSettle).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('settlement-row-expanded')).toBeNull();
  });

  it('replaces the action with Success when the row is already settled', async () => {
    const screen = await render(
      <TripEndBreakdownItem {...props} settlement={settlement({ isSettled: true })} />,
    );
    expect(screen.getByText('Success')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('settlement-row-header'));
    expect(screen.queryByTestId('settlement-row-action')).toBeNull();
  });
});
