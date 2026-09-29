import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';
import { CURRENCIES } from '@/lib/currency';

import { VaultSettlementScreen } from './VaultSettlementScreen';
import type { CashDebtDto } from '../api/endTrip';
import type { SettlementPreviewDto } from '../api/queries';

const mockSettlementState: {
  data: SettlementPreviewDto | undefined;
  isError: boolean;
  refetch: () => void;
} = {
  data: undefined,
  isError: false,
  refetch: jest.fn(),
};
const mockConfirmMutate = jest.fn();
const mockConfirmState = { isPending: false, variables: undefined as number | undefined };

jest.mock('@/features/vault/api/queries', () => ({
  useVaultSettlement: () => mockSettlementState,
}));
jest.mock('@/features/vault/api/endTrip', () => ({
  useConfirmVaultCashDebt: () => ({ mutate: mockConfirmMutate, ...mockConfirmState }),
}));
jest.mock('@/features/exchange/useExchangeRate', () => ({
  useExchangeRate: () => ({ data: undefined }),
}));

function debt(overrides: Partial<CashDebtDto> = {}): CashDebtDto {
  return {
    fromUserId: 2,
    fromDisplayName: 'Shin',
    toUserId: 1,
    toDisplayName: 'Hyydesi',
    amountMicro: '1500000',
    isConfirmed: false,
    canConfirm: true,
    lines: [],
    toWalletAddress: null,
    ...overrides,
  };
}

function preview(overrides: Partial<SettlementPreviewDto> = {}): SettlementPreviewDto {
  return {
    balanceMicro: '0',
    totalOnChainMicro: '0',
    totalOffChainMicro: '0',
    payouts: [],
    canSettle: true,
    blockedReason: null,
    isSettled: true,
    cashDebts: [],
    ...overrides,
  };
}

const props = {
  tripId: 5,
  totalSpent: 1_500_000,
  currency: CURRENCIES.VND,
  members: [],
  myUserId: 1,
};

describe('VaultSettlementScreen', () => {
  beforeAll(() => {
    initI18n();
  });

  beforeEach(() => {
    mockSettlementState.data = undefined;
    mockSettlementState.isError = false;
    mockConfirmMutate.mockClear();
    mockConfirmState.isPending = false;
    mockConfirmState.variables = undefined;
  });

  it('shows the settling banner while the vault has not wound up yet', async () => {
    mockSettlementState.data = preview({ isSettled: false });
    const screen = await render(<VaultSettlementScreen {...props} />);
    expect(screen.getByText('Settling the trip fund…')).toBeTruthy();
  });

  it('shows the empty state once settled with nothing left for the caller', async () => {
    mockSettlementState.data = preview({ isSettled: true, cashDebts: [] });
    const screen = await render(<VaultSettlementScreen {...props} />);
    expect(screen.getByText('Nothing left to settle in cash')).toBeTruthy();
  });

  it('filters cash debts to only the ones involving the caller', async () => {
    mockSettlementState.data = preview({
      cashDebts: [debt({ fromUserId: 2, toUserId: 1 }), debt({ fromUserId: 2, toUserId: 3 })],
    });
    const screen = await render(<VaultSettlementScreen {...props} />);
    expect(screen.getAllByTestId('vault-settlement-row')).toHaveLength(1);
  });

  it('confirming a debt calls the mutation with the debtor id', async () => {
    mockSettlementState.data = preview({ cashDebts: [debt({ fromUserId: 2, toUserId: 1 })] });
    const screen = await render(<VaultSettlementScreen {...props} />);
    await fireEvent.press(screen.getByTestId('vault-settlement-row-toggle'));
    await fireEvent.press(screen.getByTestId('vault-settlement-mark-done'));
    expect(mockConfirmMutate).toHaveBeenCalledWith(2, expect.anything());
  });

  it('shows a retry action when the query errors', async () => {
    mockSettlementState.isError = true;
    const screen = await render(<VaultSettlementScreen {...props} />);
    expect(screen.getByTestId('vault-settlement-error')).toBeTruthy();
    await fireEvent.press(screen.getByText('Retry'));
    expect(mockSettlementState.refetch).toHaveBeenCalled();
  });
});
