import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import React from 'react';

import { initI18n } from '@/i18n';
import { CURRENCIES } from '@/lib/currency';

import type { CounterpartySettlementDto } from '../api/queries';
import { TripEndBreakdownTab } from './TripEndBreakdownTab';

const mockSettlementsState: {
  data: { settlements: CounterpartySettlementDto[] } | undefined;
  isPending: boolean;
} = {
  data: undefined,
  isPending: false,
};
const mockMutate = jest.fn();
let lastMutateOptions: { onSuccess?: () => void; onError?: (err: unknown) => void } | undefined;

jest.mock('@/features/settlement/api/queries', () => ({
  useSettlements: () => mockSettlementsState,
}));
jest.mock('@/features/settlement/api/mutations', () => ({
  useSettleCounterparty: () => ({
    isPending: false,
    mutate: (body: unknown, options: typeof lastMutateOptions) => {
      lastMutateOptions = options;
      mockMutate(body, options);
    },
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const settlement: CounterpartySettlementDto = {
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
  ],
};

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

describe('TripEndBreakdownTab', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    mockMutate.mockClear();
    lastMutateOptions = undefined;
    mockSettlementsState.data = { settlements: [settlement] };
    mockSettlementsState.isPending = false;
    jest.mocked(Haptics.notificationAsync).mockClear();
  });

  it('fires a success haptic notification when settle succeeds', async () => {
    const screen = await render(<TripEndBreakdownTab {...props} />, { wrapper });

    await fireEvent.press(screen.getByTestId('settlement-row-header'));
    await fireEvent.press(screen.getByTestId('settlement-row-action'));
    await fireEvent.press(screen.getByTestId('trip-end-confirm-button'));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    lastMutateOptions?.onSuccess?.();

    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
  });
});
