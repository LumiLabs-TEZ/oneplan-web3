import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { useVaultHistory, useVaultTransaction, type VaultHistoryEntryDto } from '../api/queries';
import { VaultHistoryView } from './VaultHistoryView';

jest.mock('../api/queries');
jest.mock('../api/pay');

const mockedUseVaultHistory = jest.mocked(useVaultHistory);
const mockedUseVaultTransaction = jest.mocked(useVaultTransaction);

function entry(overrides: Partial<VaultHistoryEntryDto> = {}): VaultHistoryEntryDto {
  return {
    id: 1,
    kind: 'SPEND',
    status: 'CONFIRMED',
    needsApproval: false,
    amountMicro: '7660000',
    amountVnd: '200000',
    shareWith: [],
    title: 'Coffee',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('VaultHistoryView', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    mockedUseVaultTransaction.mockReturnValue({
      data: undefined,
      isLoading: false,
    } as never);
  });

  it('shows a spinner only on the first load (no entries yet)', async () => {
    mockedUseVaultHistory.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as never);

    const screen = await render(<VaultHistoryView tripId={5} />);
    expect(screen.queryByText('No history')).toBeNull();
  });

  it('shows the empty state when there is no history', async () => {
    mockedUseVaultHistory.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as never);

    const screen = await render(<VaultHistoryView tripId={5} />);
    expect(screen.getByText('No history')).toBeTruthy();
    expect(screen.getByText('Deposit USDC or pay a merchant to get started')).toBeTruthy();
  });

  it('groups entries by day and renders a day total', async () => {
    mockedUseVaultHistory.mockReturnValue({
      data: [
        entry({ id: 1, title: 'Coffee' }),
        entry({ id: 2, title: 'Lunch', amountVnd: '100000' }),
      ],
      isLoading: false,
      isError: false,
    } as never);

    const screen = await render(<VaultHistoryView tripId={5} />);
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Coffee')).toBeTruthy();
    expect(screen.getByText('Lunch')).toBeTruthy();
    expect(screen.getByText('-300,000đ')).toBeTruthy();
  });

  it('shows a load error message', async () => {
    mockedUseVaultHistory.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as never);

    const screen = await render(<VaultHistoryView tripId={5} />);
    expect(screen.getByText('Could not load history')).toBeTruthy();
  });

  it('tapping a SPEND row opens the transaction-detail sheet', async () => {
    mockedUseVaultHistory.mockReturnValue({
      data: [entry({ id: 7, title: 'Coffee' })],
      isLoading: false,
      isError: false,
    } as never);
    mockedUseVaultTransaction.mockReturnValue({
      data: {
        id: 7,
        status: 'CONFIRMED',
        needsApproval: false,
        canApprove: false,
        canCancel: false,
        canEdit: false,
        amountVnd: '200000',
        amountUsdcMicro: '7660000',
        recipientName: 'Nguyen Van A',
        bankName: 'Techcombank',
        bankAccountNumber: '123',
        feeMicro: '0',
        rate: '26500',
        shareWith: [],
        createdAt: new Date().toISOString(),
      },
      isLoading: false,
    } as never);

    const screen = await render(<VaultHistoryView tripId={5} />);
    await fireEvent.press(screen.getByText('Coffee'));
    expect(screen.getByText('Transaction details')).toBeTruthy();
  });

  it('does not open a sheet for a DEPOSIT row (no receipt to show)', async () => {
    mockedUseVaultHistory.mockReturnValue({
      data: [entry({ id: 3, kind: 'DEPOSIT', title: 'Deposit USDC', amountVnd: undefined })],
      isLoading: false,
      isError: false,
    } as never);

    const screen = await render(<VaultHistoryView tripId={5} />);
    await fireEvent.press(screen.getByText('Deposit USDC'));
    expect(screen.queryByText('Transaction details')).toBeNull();
  });
});
