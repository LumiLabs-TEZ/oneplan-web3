import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import React, { createRef } from 'react';

import { CURRENCIES } from '@/lib/currency';
import { initI18n } from '@/i18n';
import { consumeSelfLeave } from '@/realtime/realtimeStore';

import { LeaveTripSheet, type LeaveTripSheetRef } from './LeaveTripSheet';

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (...a: unknown[]) => mockPush(...a),
    replace: (...a: unknown[]) => mockReplace(...a),
  },
}));

const mockMutateAsync = jest.fn();
jest.mock('@/features/trip/api/mutations', () => ({
  ...jest.requireActual('@/features/trip/api/mutations'),
  useRemoveMember: () => ({ mutateAsync: mockMutateAsync }),
}));

const mockPreviewState: { data: unknown; isPending: boolean } = {
  data: undefined,
  isPending: false,
};
jest.mock('@/features/trip/api/leave', () => ({
  useLeavePreview: () => mockPreviewState,
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const preview = {
  displayName: 'Ken',
  budgets: [
    { budgetName: 'Trip Fund', amount: 500_000, isPaid: true, refundAmount: 500_000 },
    { budgetName: 'Food Pool', amount: 200_000, isPaid: false, refundAmount: 0 },
  ],
  totalBudgetRefund: 500_000,
  totalBudgetCancelled: 200_000,
  totalExpenseShare: 150_000,
  netSettlement: 350_000,
};

describe('LeaveTripSheet', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    mockPush.mockReset();
    mockReplace.mockReset();
    mockMutateAsync.mockReset();
    mockPreviewState.data = undefined;
    mockPreviewState.isPending = false;
  });

  it('shows a spinner while the preview is loading', async () => {
    mockPreviewState.isPending = true;
    const ref = createRef<LeaveTripSheetRef>();
    const screen = await render(
      <LeaveTripSheet ref={ref} tripId={5} currentUserId={1} currency={CURRENCIES.VND} />,
      { wrapper },
    );
    await act(async () => ref.current?.present());
    expect(screen.queryByText('Confirm Leave')).toBeTruthy();
    expect(screen.queryByText('Trip Fund')).toBeNull();
  });

  it('renders budget rows and the settlement summary once loaded', async () => {
    mockPreviewState.data = preview;
    const ref = createRef<LeaveTripSheetRef>();
    const screen = await render(
      <LeaveTripSheet ref={ref} tripId={5} currentUserId={1} currency={CURRENCIES.VND} />,
      { wrapper },
    );
    await act(async () => ref.current?.present());

    expect(screen.getByText('Trip Fund')).toBeTruthy();
    expect(screen.getByText('Food Pool')).toBeTruthy();
    // The row refund and the section Total both read "+500,000đ".
    expect(screen.getAllByRole('text', { name: '+500,000đ' }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('+350,000đ (refund)')).toBeTruthy();
  });

  it('confirming leave removes the member, invalidates lists, and navigates to the end screen', async () => {
    mockPreviewState.data = preview;
    mockMutateAsync.mockResolvedValue({ displayName: 'Ken', netSettlement: 350_000 });
    const ref = createRef<LeaveTripSheetRef>();
    const screen = await render(
      <LeaveTripSheet ref={ref} tripId={5} currentUserId={1} currency={CURRENCIES.VND} />,
      { wrapper },
    );
    await act(async () => ref.current?.present());

    await fireEvent.press(screen.getByTestId('leave-trip-confirm'));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith(1));
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/trip/[tripId]/end',
      params: {
        tripId: '5',
        mode: 'leaving',
        settlement: JSON.stringify({ displayName: 'Ken', netSettlement: 350_000 }),
      },
    });
  });

  it('flags the leave as self-initiated so the realtime "removed" handler does not navigate again (H3)', async () => {
    mockPreviewState.data = preview;
    mockMutateAsync.mockResolvedValue({ displayName: 'Ken', netSettlement: 350_000 });
    const ref = createRef<LeaveTripSheetRef>();
    const screen = await render(
      <LeaveTripSheet ref={ref} tripId={5} currentUserId={1} currency={CURRENCIES.VND} />,
      { wrapper },
    );
    await act(async () => ref.current?.present());
    await fireEvent.press(screen.getByTestId('leave-trip-confirm'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());

    expect(consumeSelfLeave(5)).toBe(true);
  });

  it('clears the self-leave flag when the leave fails, so a later real removal still acts', async () => {
    mockPreviewState.data = preview;
    mockMutateAsync.mockRejectedValue(new Error('nope'));
    const ref = createRef<LeaveTripSheetRef>();
    const screen = await render(
      <LeaveTripSheet ref={ref} tripId={5} currentUserId={1} currency={CURRENCIES.VND} />,
      { wrapper },
    );
    await act(async () => ref.current?.present());
    await fireEvent.press(screen.getByTestId('leave-trip-confirm'));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());

    expect(consumeSelfLeave(5)).toBe(false);
  });
});
