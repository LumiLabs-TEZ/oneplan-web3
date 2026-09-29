/**
 * Loading / error / empty branches of the Breakdown tab. Kept in its own file so it does not
 * collide with `TripEndBreakdownTab.test.tsx` (haptics), which mocks the same modules.
 */
import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';
import { CURRENCIES } from '@/lib/currency';

import type { CounterpartySettlementDto } from '../api/queries';
import { TripEndBreakdownTab } from './TripEndBreakdownTab';

interface SettlementsState {
  data?: { settlements: CounterpartySettlementDto[] };
  isLoading: boolean;
  isError: boolean;
  refetch: jest.Mock;
}

const mockSettlements: SettlementsState = {
  data: undefined,
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
};

const mockSettle = { isPending: false, variables: undefined, mutate: jest.fn() };

jest.mock('@/features/settlement/api/queries', () => ({
  useSettlements: () => mockSettlements,
}));
jest.mock('@/features/settlement/api/mutations', () => ({
  useSettleCounterparty: () => mockSettle,
}));

const props = {
  tripId: 5,
  mode: 'flow' as const,
  currency: CURRENCIES.VND,
  breakdown: undefined,
  fallbackTotalSpent: 1_500_000,
  fallbackUnsettled: 1,
  members: [],
  currentUserId: 1,
  leaveSettlement: null,
  onLeaveDone: jest.fn(),
};

describe('TripEndBreakdownTab states', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    mockSettlements.data = undefined;
    mockSettlements.isLoading = false;
    mockSettlements.isError = false;
    mockSettlements.refetch.mockClear();
  });

  it('shows an error state with Retry when the query failed', async () => {
    mockSettlements.isError = true;
    const screen = await render(<TripEndBreakdownTab {...props} />);

    expect(screen.getByTestId('settlements-error')).toBeTruthy();
    expect(screen.getByText('Failed to load settlements')).toBeTruthy();

    await fireEvent.press(screen.getByText('Retry'));
    expect(mockSettlements.refetch).toHaveBeenCalledTimes(1);
  });

  it('does not hang on a spinner in leaving mode when the settlement param was unusable', async () => {
    // `useSettlements` is disabled for a leaving member, so the query stays *pending* forever —
    // the tab must branch on `isLoading` and fall through to the error state instead.
    const screen = await render(
      <TripEndBreakdownTab {...props} mode="leaving" leaveSettlement={null} />,
    );

    expect(screen.getByTestId('settlements-error')).toBeTruthy();
    // Nothing to retry — the query is disabled for this member.
    expect(screen.queryByText('Retry')).toBeNull();
  });

  it('still renders the hero total while loading', async () => {
    mockSettlements.isLoading = true;
    const screen = await render(<TripEndBreakdownTab {...props} />);
    expect(screen.getByTestId('trip-end-hero')).toBeTruthy();
    expect(screen.queryByTestId('settlements-error')).toBeNull();
  });

  it('renders the rows once the query resolves', async () => {
    mockSettlements.data = {
      settlements: [
        {
          counterpartyUserId: 2,
          displayName: 'Shin',
          avatarUrl: null,
          isGroup: false,
          direction: 'receive',
          totalAmount: 1_500_000,
          isSettled: false,
          items: [],
        },
      ],
    };
    const screen = await render(<TripEndBreakdownTab {...props} />);
    expect(screen.getByTestId('settlement-row-2')).toBeTruthy();
    expect(screen.queryByTestId('settlements-error')).toBeNull();
  });
});
