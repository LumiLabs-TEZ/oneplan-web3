import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

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

// eslint-disable-next-line import/first -- must follow the jest.mock hoists
import { TripVaultSection } from './TripVaultSection';

describe('TripVaultSection', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    mockRouterPush.mockClear();
    mockDepositMutate.mockClear();
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
    expect(mockDepositMutate).toHaveBeenCalledWith(5_000_000n, expect.anything());
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
});
