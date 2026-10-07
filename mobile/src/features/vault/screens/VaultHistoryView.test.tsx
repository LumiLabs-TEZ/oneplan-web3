import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';

import { initI18n } from '@/i18n';

import { useVaultHistory, type VaultHistoryEntryDto } from '../api/queries';
import { VaultHistoryView } from './VaultHistoryView';

jest.mock('../api/queries');
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const mockedUseVaultHistory = jest.mocked(useVaultHistory);
const mockedPush = jest.mocked(router.push);

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
    mockedPush.mockClear();
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
    expect(screen.getByText('-$15.32')).toBeTruthy();
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

  it('tapping a SPEND row pushes the full-screen transaction detail', async () => {
    mockedUseVaultHistory.mockReturnValue({
      data: [entry({ id: 7, title: 'Coffee' })],
      isLoading: false,
      isError: false,
    } as never);

    const screen = await render(<VaultHistoryView tripId={5} />);
    await fireEvent.press(screen.getByText('Coffee'));
    expect(mockedPush).toHaveBeenCalledWith({
      pathname: '/trip/[tripId]/vault/transaction/[transactionId]',
      params: { tripId: '5', transactionId: '7' },
    });
  });

  it('tapping a DEPOSIT row pushes the detail too, read-only after the trip ends', async () => {
    mockedUseVaultHistory.mockReturnValue({
      data: [entry({ id: 3, kind: 'DEPOSIT', title: 'Deposit USDC', amountVnd: undefined })],
      isLoading: false,
      isError: false,
    } as never);

    const screen = await render(<VaultHistoryView tripId={5} allowsEditing={false} />);
    await fireEvent.press(screen.getByText('Deposit USDC'));
    expect(mockedPush).toHaveBeenCalledWith({
      pathname: '/trip/[tripId]/vault/transaction/[transactionId]',
      params: { tripId: '5', transactionId: '3', readOnly: '1' },
    });
  });

  it('a SETTLEMENT row does not open anything', async () => {
    mockedUseVaultHistory.mockReturnValue({
      data: [entry({ id: 4, kind: 'SETTLEMENT', title: 'Settled', amountVnd: undefined })],
      isLoading: false,
      isError: false,
    } as never);

    const screen = await render(<VaultHistoryView tripId={5} />);
    await fireEvent.press(screen.getByText('Settled'));
    expect(mockedPush).not.toHaveBeenCalled();
  });
});
