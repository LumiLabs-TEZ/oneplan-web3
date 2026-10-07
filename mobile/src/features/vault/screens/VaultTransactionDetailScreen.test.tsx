import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { Alert } from 'react-native';

import { initI18n } from '@/i18n';

import { useApproveVaultTransaction, useCancelVaultTransaction } from '../api/pay';
import { WalletError } from '../wallet/walletError';
import type { VaultTransactionDetail } from './transactionDetailMapping';
import { VaultTransactionDetailScreen } from './VaultTransactionDetailScreen';

// Keep the real `vaultPayErrorMessage` / `VaultPayError`; only the mutation hooks are faked.
jest.mock('../api/pay', () => ({
  ...jest.requireActual('../api/pay'),
  useApproveVaultTransaction: jest.fn(),
  useCancelVaultTransaction: jest.fn(),
}));

const mockedApprove = jest.mocked(useApproveVaultTransaction);
const mockedCancel = jest.mocked(useCancelVaultTransaction);

function detail(overrides: Partial<VaultTransactionDetail> = {}): VaultTransactionDetail {
  return {
    amountVnd: 200_000,
    recipientName: 'Nguyen Van A',
    status: 'completed',
    createdAt: '2026-01-01T08:00:00.000Z',
    bankName: 'Techcombank',
    bankAccountNumber: '0271003061328',
    feeVnd: 1500,
    feePercent: 0.75,
    feeUsdc: 0.06,
    rate: 26_500,
    note: null,
    name: 'Cafe',
    needsApproval: false,
    canApprove: false,
    canCancel: false,
    canEdit: true,
    category: 'COFFEE',
    paidByName: null,
    shareWithNames: [],
    shareWithUserIds: [],
    madeByName: 'Cattie',
    madeByAvatarUrl: null,
    qrPayload: null,
    ...overrides,
  };
}

describe('VaultTransactionDetailScreen', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    mockedApprove.mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as never);
    mockedCancel.mockReturnValue({ mutateAsync: jest.fn(), isPending: false } as never);
  });

  it('shows no approve/cancel buttons when the server says neither is allowed', async () => {
    const screen = await render(
      <VaultTransactionDetailScreen detail={detail()} onBack={jest.fn()} />,
    );
    expect(screen.queryByTestId('vault-detail-approve')).toBeNull();
    expect(screen.queryByTestId('vault-detail-cancel')).toBeNull();
  });

  it('shows "Waiting for another member" when needsApproval but the viewer cannot approve', async () => {
    const screen = await render(
      <VaultTransactionDetailScreen
        detail={detail({ needsApproval: true, canApprove: false })}
        onBack={jest.fn()}
      />,
    );
    expect(screen.getByText('Waiting for another member to approve')).toBeTruthy();
    expect(screen.queryByTestId('vault-detail-approve')).toBeNull();
  });

  it('shows the Approve button and calls the mutation when canApprove is true', async () => {
    const mutateAsync = jest.fn(async () => undefined);
    mockedApprove.mockReturnValue({ mutateAsync, isPending: false } as never);
    const onApproved = jest.fn();

    const screen = await render(
      <VaultTransactionDetailScreen
        detail={detail({ needsApproval: true, canApprove: true })}
        tripId={5}
        vaultTransactionId={42}
        onBack={jest.fn()}
        onApproved={onApproved}
      />,
    );

    await fireEvent.press(screen.getByTestId('vault-detail-approve'));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ vaultTransactionId: 42 }));
    expect(onApproved).toHaveBeenCalledTimes(1);
  });

  it('shows the Cancel button only when canCancel is true', async () => {
    const screen = await render(
      <VaultTransactionDetailScreen detail={detail({ canCancel: true })} onBack={jest.fn()} />,
    );
    expect(screen.getByTestId('vault-detail-cancel')).toBeTruthy();
  });

  it('hides "Edit details" when canEdit is false, even if allowsEditing is true', async () => {
    const screen = await render(
      <VaultTransactionDetailScreen
        detail={detail({ canEdit: false })}
        tripId={5}
        vaultTransactionId={42}
        onBack={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('vault-detail-edit')).toBeNull();
  });

  it('hides "Edit details" when allowsEditing is false (trip ended), even if canEdit is true', async () => {
    const screen = await render(
      <VaultTransactionDetailScreen
        detail={detail({ canEdit: true })}
        tripId={5}
        vaultTransactionId={42}
        allowsEditing={false}
        onBack={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('vault-detail-edit')).toBeNull();
  });

  it('hides "Edit details" when tripId/vaultTransactionId are missing, even if canEdit is true', async () => {
    const screen = await render(
      <VaultTransactionDetailScreen detail={detail({ canEdit: true })} onBack={jest.fn()} />,
    );
    expect(screen.queryByTestId('vault-detail-edit')).toBeNull();
  });

  it('shows "Edit details" when every gate passes, and swaps in the edit screen on tap', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const screen = await render(
      <QueryClientProvider client={client}>
        <VaultTransactionDetailScreen
          detail={detail({ canEdit: true, status: 'completed' })}
          tripId={5}
          vaultTransactionId={42}
          members={[]}
          onBack={jest.fn()}
        />
      </QueryClientProvider>,
    );
    await fireEvent.press(screen.getByTestId('vault-detail-edit'));
    expect(screen.getByTestId('vault-edit-done')).toBeTruthy();
  });

  it('shows Send again only when onSendAgain is provided', async () => {
    const screen = await render(
      <VaultTransactionDetailScreen detail={detail()} onBack={jest.fn()} onSendAgain={jest.fn()} />,
    );
    expect(screen.getByTestId('vault-detail-send-again')).toBeTruthy();
  });

  it('renders Completed/Processing/Failed status labels', async () => {
    const completed = await render(
      <VaultTransactionDetailScreen detail={detail({ status: 'completed' })} onBack={jest.fn()} />,
    );
    expect(completed.getByText('Completed')).toBeTruthy();

    const pending = await render(
      <VaultTransactionDetailScreen detail={detail({ status: 'pending' })} onBack={jest.fn()} />,
    );
    expect(pending.getByText('Processing')).toBeTruthy();

    const failed = await render(
      <VaultTransactionDetailScreen detail={detail({ status: 'failed' })} onBack={jest.fn()} />,
    );
    expect(failed.getByText('Failed')).toBeTruthy();
  });

  it('shows "All" for an empty share list and a name for a single sharer', async () => {
    const all = await render(
      <VaultTransactionDetailScreen detail={detail({ shareWithNames: [] })} onBack={jest.fn()} />,
    );
    expect(all.getByText('All')).toBeTruthy();

    const single = await render(
      <VaultTransactionDetailScreen
        detail={detail({ shareWithNames: ['Nam'] })}
        onBack={jest.fn()}
      />,
    );
    expect(single.getByText('Nam')).toBeTruthy();
  });

  describe('approve / cancel accessibility and errors', () => {
    const renderActionable = () =>
      render(
        <VaultTransactionDetailScreen
          detail={detail({ needsApproval: true, canApprove: true, canCancel: true })}
          tripId={5}
          vaultTransactionId={42}
          onBack={jest.fn()}
        />,
      );

    /** Presses Cancel payment, then confirms the destructive action in the alert. */
    async function cancelAndConfirm(screen: Awaited<ReturnType<typeof renderActionable>>) {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      await fireEvent.press(screen.getByTestId('vault-detail-cancel'));
      const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
      const confirm = buttons.find((b) => b.style === 'destructive');
      await act(async () => {
        confirm?.onPress?.();
      });
      alertSpy.mockRestore();
    }

    it('labels Approve and Cancel as buttons with their visible text', async () => {
      const screen = await renderActionable();
      const approve = screen.getByTestId('vault-detail-approve');
      const cancel = screen.getByTestId('vault-detail-cancel');
      expect(approve.props.accessibilityRole).toBe('button');
      expect(approve.props.accessibilityLabel).toBe('Approve payment');
      expect(approve.props.accessibilityState).toEqual({ busy: false, disabled: false });
      expect(cancel.props.accessibilityRole).toBe('button');
      expect(cancel.props.accessibilityLabel).toBe('Cancel payment');
      expect(cancel.props.accessibilityState).toEqual({ busy: false, disabled: false });
    });

    it('keeps the Approve label and reports busy while approving (spinner replaces the text)', async () => {
      mockedApprove.mockReturnValue({ mutateAsync: jest.fn(), isPending: true } as never);
      const screen = await renderActionable();
      expect(screen.queryByText('Approve payment')).toBeNull();
      const approve = screen.getByTestId('vault-detail-approve');
      expect(approve.props.accessibilityLabel).toBe('Approve payment');
      expect(approve.props.accessibilityState).toEqual({ busy: true, disabled: true });
      // The other action is disabled but not busy.
      expect(screen.getByTestId('vault-detail-cancel').props.accessibilityState).toEqual({
        busy: false,
        disabled: true,
      });
    });

    it('keeps the Cancel label and reports busy while cancelling', async () => {
      mockedCancel.mockReturnValue({ mutateAsync: jest.fn(), isPending: true } as never);
      const screen = await renderActionable();
      const cancel = screen.getByTestId('vault-detail-cancel');
      expect(cancel.props.accessibilityLabel).toBe('Cancel payment');
      expect(cancel.props.accessibilityState).toEqual({ busy: true, disabled: true });
    });

    it('shows the approve fallback, not the history one, when approving fails generically', async () => {
      mockedApprove.mockReturnValue({
        mutateAsync: jest.fn().mockRejectedValue(new Error('')),
        isPending: false,
      } as never);
      const screen = await renderActionable();
      await fireEvent.press(screen.getByTestId('vault-detail-approve'));
      expect(await screen.findByText('Could not approve the payment.')).toBeTruthy();
      expect(screen.queryByText('Could not load history')).toBeNull();
    });

    it('shows the cancel fallback when cancelling fails generically', async () => {
      mockedCancel.mockReturnValue({
        mutateAsync: jest.fn().mockRejectedValue(new Error('')),
        isPending: false,
      } as never);
      const screen = await renderActionable();
      await cancelAndConfirm(screen);
      expect(await screen.findByText('Could not cancel the payment.')).toBeTruthy();
      expect(screen.queryByText('Could not load history')).toBeNull();
    });

    it('still shows a wallet error other than cancelled', async () => {
      mockedApprove.mockReturnValue({
        mutateAsync: jest.fn().mockRejectedValue(WalletError.signingFailed('boom')),
        isPending: false,
      } as never);
      const screen = await renderActionable();
      await fireEvent.press(screen.getByTestId('vault-detail-approve'));
      expect(await screen.findByText('Could not sign: boom')).toBeTruthy();
    });

    it('says nothing when the member cancels approval in their wallet', async () => {
      const mutateAsync = jest.fn().mockRejectedValue(WalletError.cancelled());
      mockedApprove.mockReturnValue({ mutateAsync, isPending: false } as never);
      const screen = await renderActionable();
      await fireEvent.press(screen.getByTestId('vault-detail-approve'));
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      expect(screen.queryByText('Cancelled in your wallet.')).toBeNull();
      expect(screen.queryByText('Could not approve the payment.')).toBeNull();
    });

    it('says nothing when the member cancels the cancel-payment signature in their wallet', async () => {
      const mutateAsync = jest.fn().mockRejectedValue(WalletError.cancelled());
      mockedCancel.mockReturnValue({ mutateAsync, isPending: false } as never);
      const screen = await renderActionable();
      await cancelAndConfirm(screen);
      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      expect(screen.queryByText('Cancelled in your wallet.')).toBeNull();
      expect(screen.queryByText('Could not cancel the payment.')).toBeNull();
    });
  });
});
