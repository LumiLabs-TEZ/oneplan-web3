/**
 * The scan → amount → expense → pay → receipt orchestration (final-review H5): `payVault` must
 * actually be reachable from production UI, with what the user typed and chose.
 */
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import type { components } from '@/api/schema';
import { testMembers } from '@/features/expense/components/testMembers';
import { initI18n } from '@/i18n';

import { useVaultAnnounceStore } from '../vaultAnnounceStore';
import { VaultPayFlow } from './VaultPayFlow';

type PayOutcome = { kind: 'confirmed' | 'pending' | 'awaitingApproval'; vaultTransactionId: number };

const mockLookupMutate = jest.fn();
const mockPayMutate = jest.fn();
let mockPayPending = false;
jest.mock('../api/pay', () => ({
  ...jest.requireActual('../api/pay'),
  useLookupVaultRecipient: () => ({ mutate: mockLookupMutate }),
  usePayVault: () => ({ mutate: mockPayMutate, isPending: mockPayPending }),
}));

let mockReceipt: { data?: Partial<components['schemas']['VaultTransactionDetailDto']> };
jest.mock('../api/queries', () => ({
  useVaultBalance: () => ({ data: { balanceMicro: '10000000' } }),
  useWallet: () => ({ data: { balanceMicro: '2000000' } }),
  useVaultTransaction: () => mockReceipt,
}));
jest.mock('@/features/me/useMe', () => ({
  useMe: () => ({ data: { id: 1, displayName: 'Ken', avatarUrl: null } }),
}));

jest.mock('./transactionDetailMapping', () => ({
  mapVaultTransactionDetail: (dto: { recipientName: string }) => ({ recipientName: dto.recipientName }),
}));
jest.mock('./VaultTransactionDetailScreen', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
    VaultTransactionDetailScreen: (props: { vaultTransactionId: number }) =>
      React.createElement(Text, { testID: 'receipt-screen' }, `receipt ${props.vaultTransactionId}`),
  };
});

/** Tag 38 (merchant, bank BIN 970422 / account 123456), no amount — the user types it. */
function vietQr(): string {
  const beneficiary = '00' + '06' + '970422' + '01' + '06' + '123456';
  const merchant = '01' + String(beneficiary.length).padStart(2, '0') + beneficiary;
  return '38' + String(merchant.length).padStart(2, '0') + merchant;
}

async function scanAndTypeAmount(screen: Awaited<ReturnType<typeof render>>) {
  await act(async () => {
    screen.getByTestId('qr-scanner').props.onBarcodeScanned({ data: vietQr() });
  });
  await waitFor(() => expect(screen.getByTestId('vault-pay-amount-screen')).toBeTruthy());
  await fireEvent.press(screen.getByTestId('key-2'));
  await fireEvent.press(screen.getByTestId('key-0'));
  await fireEvent.press(screen.getByTestId('key-0'));
  await fireEvent.press(screen.getByTestId('key-0'));
  await fireEvent.press(screen.getByTestId('key-0'));
  await fireEvent.press(screen.getByTestId('key-0'));
  await fireEvent.press(screen.getByTestId('vault-pay-amount-next'));
}

describe('VaultPayFlow', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPayPending = false;
    mockReceipt = {};
    useVaultAnnounceStore.getState().clear();
  });

  const renderFlow = (onClose = jest.fn()) =>
    render(<VaultPayFlow tripId={5} members={testMembers} onClose={onClose} />);

  it('starts at the scanner; scanning looks the recipient up and moves to the amount', async () => {
    const screen = await renderFlow();
    expect(screen.getByTestId('vault-scan-qr-screen')).toBeTruthy();

    await act(async () => {
      screen.getByTestId('qr-scanner').props.onBarcodeScanned({ data: vietQr() });
    });

    await waitFor(() => expect(screen.getByTestId('vault-pay-amount-screen')).toBeTruthy());
    expect(mockLookupMutate).toHaveBeenCalledWith(vietQr(), expect.anything());
    expect(screen.getByTestId('vault-pay-amount-recipient')).toHaveTextContent('…');

    // The lookup answering names the recipient on the amount screen.
    await act(async () => {
      mockLookupMutate.mock.calls[0][1].onSuccess({ recipientName: 'Nguyen Van A' });
    });
    expect(screen.getByTestId('vault-pay-amount-recipient')).toHaveTextContent('Nguyen Van A');
  });

  it('Done on the expense sheet pays through payVault with the typed amount and chosen details', async () => {
    const screen = await renderFlow();
    await scanAndTypeAmount(screen);

    await fireEvent.press(screen.getByTestId('vault-expense-payer-me'));
    await fireEvent.changeText(screen.getByTestId('vault-expense-name'), 'Pho');
    await fireEvent.press(screen.getByTestId('vault-expense-done'));

    expect(mockPayMutate).toHaveBeenCalledTimes(1);
    expect(mockPayMutate.mock.calls[0][0]).toEqual({
      request: {
        qrPayload: vietQr(),
        amountVnd: '200000',
        name: 'Pho',
        category: 'COFFEE',
        shareWithUserIds: [],
        source: 'PERSONAL',
      },
    });
  });

  it('a confirmed payment opens its receipt', async () => {
    mockReceipt = { data: { recipientName: 'Nguyen Van A', qrPayload: null } };
    const onClose = jest.fn();
    const screen = await renderFlow(onClose);
    await scanAndTypeAmount(screen);
    await fireEvent.press(screen.getByTestId('vault-expense-done'));

    await act(async () => {
      mockPayMutate.mock.calls[0][1].onSuccess({ kind: 'confirmed', vaultTransactionId: 42 } as PayOutcome);
    });

    expect(await screen.findByTestId('receipt-screen')).toHaveTextContent('receipt 42');
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each([
    ['pending', 'Sent. Waiting on the bank to confirm.'],
    ['awaitingApproval', 'Over the trip limit. Waiting for a member to approve.'],
  ] as const)('a %s payment is announced on the card, not raised as an error', async (kind, message) => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onClose = jest.fn();
    const screen = await renderFlow(onClose);
    await scanAndTypeAmount(screen);
    await fireEvent.press(screen.getByTestId('vault-expense-done'));

    await act(async () => {
      mockPayMutate.mock.calls[0][1].onSuccess({ kind, vaultTransactionId: 7 } as PayOutcome);
    });

    expect(useVaultAnnounceStore.getState().message).toBe(message);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('a failed payment alerts and stays on the amount so it can be sent again', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onClose = jest.fn();
    const screen = await renderFlow(onClose);
    await scanAndTypeAmount(screen);
    await fireEvent.press(screen.getByTestId('vault-expense-done'));

    await act(async () => {
      mockPayMutate.mock.calls[0][1].onError(new Error('boom'));
    });

    expect(alertSpy).toHaveBeenCalledWith('Payment failed', expect.any(String));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('vault-pay-amount-screen')).toBeTruthy();
    alertSpy.mockRestore();
  });

  it('shows the Paying… overlay while the payment is in flight', async () => {
    mockPayPending = true;
    const screen = await renderFlow();
    await scanAndTypeAmount(screen);
    expect(screen.getByTestId('vault-expense-working')).toBeTruthy();
  });

  it('the amount screen back button returns to the scanner', async () => {
    const screen = await renderFlow();
    await act(async () => {
      screen.getByTestId('qr-scanner').props.onBarcodeScanned({ data: vietQr() });
    });
    await waitFor(() => expect(screen.getByTestId('vault-pay-amount-screen')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('vault-pay-amount-back-label'));
    expect(screen.getByTestId('vault-scan-qr-screen')).toBeTruthy();
  });
});
