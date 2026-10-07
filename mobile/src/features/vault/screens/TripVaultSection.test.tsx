import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { initI18n } from '@/i18n';
import { useRealtimeStore } from '@/realtime/realtimeStore';
import { Alert } from 'react-native';

import { requestVaultContribute } from '../contributeHandoff';

import { VAULT_PROGRAM_ID } from '../solana/constants';
import { deriveVaultPda } from '../solana/pda';
import { useVaultAnnounceStore } from '../vaultAnnounceStore';
import { useVaultDepositFlowStore } from '../vaultDepositFlowStore';

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockRouterPush(...args) } }));

let mockBalanceData: { vaultPda: string; balanceMicro: string } | undefined = {
  vaultPda: 'VAULT_PDA',
  balanceMicro: '5000000',
};
let mockWalletData: { publicKey: string; balanceMicro: string } | undefined = {
  publicKey: 'OWNER_ADDR',
  balanceMicro: '10000000',
};
jest.mock('../api/queries', () => ({
  useVaultBalance: () => ({ data: mockBalanceData }),
  useMyVaultWallet: () => ({ data: mockWalletData }),
}));

const mockDepositMutate = jest.fn();
jest.mock('../signing/depositFlow', () => ({
  useDepositToVault: () => ({ mutate: mockDepositMutate }),
}));

const mockApproveMutate = jest.fn();
jest.mock('../api/pay', () => ({
  useApproveVaultTransaction: () => ({ mutate: mockApproveMutate }),
}));
jest.mock('@/features/me/useMe', () => ({ useMe: () => ({ data: { id: 2 } }) }));

// eslint-disable-next-line import/first -- must follow the jest.mock hoists
import { TripVaultSection } from './TripVaultSection';

describe('TripVaultSection', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    mockRouterPush.mockClear();
    mockDepositMutate.mockClear();
    mockApproveMutate.mockClear();
    useRealtimeStore.getState().reset();
    useVaultAnnounceStore.getState().clear();
    mockBalanceData = { vaultPda: 'VAULT_PDA', balanceMicro: '5000000' };
    mockWalletData = { publicKey: 'OWNER_ADDR', balanceMicro: '10000000' };
  });

  it('renders the TripVaultCard and no deposit sheet content by default', async () => {
    const screen = await render(
      <TripVaultSection
        tripId={5}
        tripName="Dubai 2025"
        balanceInHomeCurrency={100}
        homeCurrency="USD"
      />,
    );
    expect(screen.getByText('Dubai 2025')).toBeTruthy();
    expect(screen.queryByTestId('deposit-options-sheet')).toBeNull();
  });

  it('Deposit -> OnePlan Wallet -> Contribute walks through the deposit chain and starts a deposit', async () => {
    const screen = await render(
      <TripVaultSection
        tripId={5}
        tripName="Dubai 2025"
        balanceInHomeCurrency={100}
        homeCurrency="USD"
      />,
    );

    await fireEvent.press(screen.getByTestId('trip-vault-card-deposit'));
    expect(screen.getByTestId('deposit-options-sheet')).toBeTruthy();

    await fireEvent.press(screen.getByText('OnePlan Wallet'));
    expect(screen.getByTestId('contribute-to-vault-sheet')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('key-5'));
    await fireEvent.press(screen.getByTestId('contribute-submit'));

    expect(screen.getByTestId('vault-depositing-sheet')).toBeTruthy();
    expect(screen.getByTestId('vault-depositing-loading')).toBeTruthy();
    expect(mockDepositMutate).toHaveBeenCalledWith(5_000_000n, expect.anything());

    const { onSuccess } = mockDepositMutate.mock.calls[0][1];
    await act(async () => onSuccess({ signature: 'sig' }));
    expect(screen.getByTestId('vault-depositing-success')).toBeTruthy();
    expect(screen.getByText('Deposit complete')).toBeTruthy();
  });

  it('Details navigates to the trip-scoped deposit-result route', async () => {
    const screen = await render(
      <TripVaultSection
        tripId={5}
        tripName="Dubai 2025"
        balanceInHomeCurrency={100}
        homeCurrency="USD"
      />,
    );

    await fireEvent.press(screen.getByTestId('trip-vault-card-deposit'));
    await fireEvent.press(screen.getByText('OnePlan Wallet'));
    await fireEvent.press(screen.getByTestId('key-5'));
    await fireEvent.press(screen.getByTestId('contribute-submit'));

    await fireEvent.press(screen.getByText('Details'));
    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith({
        pathname: '/trip/[tripId]/vault/deposit-result',
        params: { tripId: '5' },
      }),
    );
  });

  it('shows the single Waiting-for-approval CTA when isWaitingForEndApproval is set', async () => {
    const onWaitingForApproval = jest.fn();
    const screen = await render(
      <TripVaultSection
        tripId={5}
        tripName="Dubai 2025"
        balanceInHomeCurrency={100}
        homeCurrency="USD"
        isWaitingForEndApproval
        onWaitingForApproval={onWaitingForApproval}
      />,
    );
    expect(screen.getByTestId('trip-vault-card-waiting')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('trip-vault-card-waiting'));
    expect(onWaitingForApproval).toHaveBeenCalledTimes(1);
  });

  it('the scan button opens the pay flow route for this trip (H5)', async () => {
    const screen = await render(
      <TripVaultSection
        tripId={5}
        tripName="Dubai 2025"
        balanceInHomeCurrency={100}
        homeCurrency="USD"
      />,
    );

    await fireEvent.press(screen.getByTestId('trip-vault-card-scan-qr'));

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/trip/[tripId]/vault/pay',
      params: { tripId: '5' },
    });
  });

  it('shows what the pay flow announced (pending / awaiting approval), then clears it', async () => {
    jest.useFakeTimers();
    try {
      const screen = await render(
        <TripVaultSection
          tripId={5}
          tripName="Dubai 2025"
          balanceInHomeCurrency={100}
          homeCurrency="USD"
        />,
      );
      expect(screen.queryByTestId('trip-vault-announcement')).toBeNull();

      await act(async () => {
        useVaultAnnounceStore.getState().announce('Sent. Waiting on the bank to confirm.');
      });
      expect(screen.getByText('Sent. Waiting on the bank to confirm.')).toBeTruthy();

      await act(async () => {
        jest.advanceTimersByTime(3100);
      });
      expect(screen.queryByTestId('trip-vault-announcement')).toBeNull();
      expect(useVaultAnnounceStore.getState().message).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('starts the deposit flow toward the client-derived vault address, not the server-echoed one', async () => {
    const screen = await render(
      <TripVaultSection
        tripId={5}
        tripName="Dubai 2025"
        balanceInHomeCurrency={100}
        homeCurrency="USD"
      />,
    );
    await fireEvent.press(screen.getByTestId('trip-vault-card-deposit'));
    await fireEvent.press(screen.getByText('OnePlan Wallet'));
    await fireEvent.press(screen.getByTestId('key-5'));
    await fireEvent.press(screen.getByTestId('contribute-submit'));
    await fireEvent.press(screen.getByText('Details'));

    const recipient = useVaultDepositFlowStore.getState().flow?.recipient;
    expect(recipient).toBe(deriveVaultPda(5, VAULT_PROGRAM_ID));
    expect(recipient).not.toBe('VAULT_PDA');
  });

  const section = (props: { onLeaveDepositCompleted?: () => void } = {}) => (
    <TripVaultSection
      tripId={5}
      tripName="Dubai 2025"
      balanceInHomeCurrency={100}
      homeCurrency="USD"
      {...props}
    />
  );

  it('a leave-sheet deposit request opens Contribute locked to the owed amount', async () => {
    const screen = await render(section());
    await act(async () => requestVaultContribute(5, 1_250_000));
    expect(screen.getByTestId('contribute-to-vault-sheet')).toBeTruthy();
    expect(screen.getByText('Amount is fixed to clear your leave balance.')).toBeTruthy();
    expect(screen.queryByTestId('key-5')).toBeNull();
  });

  it('ignores a deposit request for another trip or a zero amount', async () => {
    const screen = await render(section());
    await act(async () => requestVaultContribute(6, 1_250_000));
    await act(async () => requestVaultContribute(5, 0));
    expect(screen.queryByTestId('contribute-to-vault-sheet')).toBeNull();
  });

  it('a locked deposit skips the receipt and reports the leave deposit', async () => {
    const onLeaveDepositCompleted = jest.fn();
    const screen = await render(section({ onLeaveDepositCompleted }));
    await act(async () => requestVaultContribute(5, 1_000_000));
    await fireEvent.press(screen.getByTestId('contribute-submit'));
    expect(mockDepositMutate).toHaveBeenCalledWith(1_000_000n, expect.anything());
    const opts = mockDepositMutate.mock.calls[0]?.[1] as {
      onSuccess: (r: { signature: string }) => void;
    };
    await act(async () => opts.onSuccess({ signature: 'SIG' }));
    expect(onLeaveDepositCompleted).toHaveBeenCalled();
    expect(useVaultDepositFlowStore.getState().flow).toBeNull();
  });

  it("asks another member to approve an over-limit payment, and approves on 'Approve'", async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(section());
    await act(async () =>
      useRealtimeStore.getState().pushEffect({
        type: 'vaultApprovalRequested',
        tripId: 5,
        vaultTransactionId: 42,
        amountVnd: '200000',
        recipientName: 'NGUYEN VAN A',
        proposedByUserId: 1,
        approverUserIds: null,
      }),
    );
    expect(alertSpy).toHaveBeenCalledWith(
      'Approval needed',
      expect.stringContaining('đ200,000 to NGUYEN VAN A'),
      expect.any(Array),
    );
    const buttons = alertSpy.mock.calls[0]?.[2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === 'Approve')?.onPress?.();
    expect(mockApproveMutate).toHaveBeenCalledWith({ vaultTransactionId: 42 }, expect.anything());
    alertSpy.mockRestore();
  });

  it('never asks the member who raised the payment', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(section());
    await act(async () =>
      useRealtimeStore.getState().pushEffect({
        type: 'vaultApprovalRequested',
        tripId: 5,
        vaultTransactionId: 42,
        amountVnd: '200000',
        recipientName: 'NGUYEN VAN A',
        proposedByUserId: 2,
        approverUserIds: null,
      }),
    );
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
