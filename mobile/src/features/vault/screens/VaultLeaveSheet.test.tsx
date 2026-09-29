import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import React, { createRef } from 'react';

import { initI18n } from '@/i18n';

import { VaultLeaveSheet, type VaultLeaveSheetRef } from './VaultLeaveSheet';

const mockPreviewState: { data: unknown; isPending: boolean } = {
  data: undefined,
  isPending: false,
};
jest.mock('@/features/trip/api/leave', () => ({
  useLeavePreview: () => mockPreviewState,
}));

const mockAnnounceMutateAsync = jest.fn();
let mockAnnouncePending = false;
jest.mock('../api/leave', () => ({
  useAnnounceVaultLeave: () => ({
    mutateAsync: mockAnnounceMutateAsync,
    isPending: mockAnnouncePending,
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const basePreview = {
  displayName: 'Ken',
  budgets: [],
  totalBudgetRefund: 0,
  totalBudgetCancelled: 0,
  totalExpenseShare: 0,
  netSettlement: 0,
  hasVault: true,
  lines: [
    { title: 'Deposit', amountMicro: '5000000', kind: 'DEPOSIT', time: '10:00' },
    { title: 'Coffee', amountMicro: '-1200000', kind: 'SPEND', time: '11:00', category: 'COFFEE' },
  ],
  canAnnounce: true,
  leaveRequestPending: false,
  vaultLeaveCleared: false,
};

describe('VaultLeaveSheet', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    mockPreviewState.data = undefined;
    mockPreviewState.isPending = false;
    mockAnnounceMutateAsync.mockReset();
    mockAnnouncePending = false;
  });

  it('shows a spinner while the preview loads', async () => {
    mockPreviewState.isPending = true;
    const ref = createRef<VaultLeaveSheetRef>();
    const screen = await render(<VaultLeaveSheet ref={ref} tripId={5} onRequestDeposit={jest.fn()} />, {
      wrapper,
    });
    await act(async () => ref.current?.present());
    expect(screen.queryByTestId('vault-leave-ledger-row')).toBeNull();
  });

  it('owe state shows the Deposit CTA and defers the handoff to the sheet finishing dismissal', async () => {
    mockPreviewState.data = { ...basePreview, netMicro: '-2000000', owedMicro: '2000000' };
    const onRequestDeposit = jest.fn();
    const ref = createRef<VaultLeaveSheetRef>();
    const screen = await render(
      <VaultLeaveSheet ref={ref} tripId={5} onRequestDeposit={onRequestDeposit} />,
      { wrapper },
    );
    await act(async () => ref.current?.present());

    expect(screen.getByText('You owe the group')).toBeTruthy();
    const depositButton = screen.getByTestId('vault-leave-cta-deposit');
    await fireEvent.press(depositButton);

    // Mirrors iOS's `.vaultRequestContribute` timing — the caller must only be notified once
    // `AppSheet`'s `onDismiss` actually fires, never synchronously from the button press.
    expect(onRequestDeposit).not.toHaveBeenCalled();
  });

  it('receive/allGood state shows Announce host and calls the mutation', async () => {
    mockPreviewState.data = { ...basePreview, netMicro: '3000000', owedMicro: '0' };
    const ref = createRef<VaultLeaveSheetRef>();
    const screen = await render(
      <VaultLeaveSheet ref={ref} tripId={5} onRequestDeposit={jest.fn()} />,
      { wrapper },
    );
    await act(async () => ref.current?.present());

    expect(screen.getByText('You’ll receive')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('vault-leave-cta-announce'));
    await waitFor(() => expect(mockAnnounceMutateAsync).toHaveBeenCalled());
  });

  it('pending announce disables the CTA and reads "Announce sent"', async () => {
    mockPreviewState.data = { ...basePreview, netMicro: '0', owedMicro: '0', leaveRequestPending: true };
    const ref = createRef<VaultLeaveSheetRef>();
    const screen = await render(
      <VaultLeaveSheet ref={ref} tripId={5} onRequestDeposit={jest.fn()} />,
      { wrapper },
    );
    await act(async () => ref.current?.present());

    expect(screen.getByTestId('vault-leave-cta-pending')).toBeTruthy();
    expect(screen.queryByTestId('vault-leave-cta-announce')).toBeNull();
    expect(screen.queryByTestId('vault-leave-cta-deposit')).toBeNull();
  });
});
